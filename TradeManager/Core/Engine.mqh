#ifndef TM_ENGINE_MQH
#define TM_ENGINE_MQH

#include "Config.mqh"
#include "Lifecycle.mqh"
#include "StateManager.mqh"
#include "EventDispatcher.mqh"
#include "../UI/ChartPanel.mqh"
#include "../Utils/SessionClock.mqh"

// Owns and wires the modules. Holds no trading logic of its own.
class CEngine
{
private:
   CBrokerAdapter    m_broker;
   CStateStorage     m_storage;
   CRecoveryManager  m_recovery;
   CPositionEngine   m_positions;
   CProtectionEngine m_protection;
   CRiskEngine       m_risk;
   CRiskGuard        m_guard;
   CExecutionEngine  m_exec;
   CStateManager     m_state;
   CEventDispatcher  m_dispatch;
   CLifecycle        m_life;
   CChartPanel       m_panel;
   CSessionClock     m_sessions;

   void Wire()
   {
      m_broker.Init((ulong)InpDeviationPoints);
      m_storage.Init(m_broker.Login());
      m_recovery.Attach(GetPointer(m_storage));

      m_positions.Attach(GetPointer(m_broker), GetPointer(m_recovery));
      m_positions.Configure(InpMagicFilter, InpChartSymbolOnly);

      CPositionRegistry *registry = m_positions.Registry();
      m_state.Attach(registry, GetPointer(m_recovery));
      m_protection.Attach(GetPointer(m_broker), registry);
      m_risk.Attach(GetPointer(m_broker), registry, GetPointer(m_storage));
      m_guard.Attach(GetPointer(m_broker));
      m_exec.Attach(GetPointer(m_broker));

      m_dispatch.Attach(GetPointer(m_positions), GetPointer(m_protection), GetPointer(m_risk),
                        GetPointer(m_guard), GetPointer(m_exec), GetPointer(m_state));
   }

   void Configure()
   {
      SStopLossConfig sl;
      sl.defaultSLPoints = InpDefaultSLPoints;

      SBreakEvenConfig be;
      be.enabled  = InpBEEnabled;
      be.triggerR = InpBETriggerR;
      be.offsetR  = InpBEOffsetR;

      STrailingConfig tr;
      tr.enabled          = InpTrailEnabled;
      tr.mode             = InpTrailMode;
      tr.activationPoints = InpTrailActivation;
      tr.distancePoints   = InpTrailDistance;
      tr.percent          = InpTrailPercent;
      tr.stepPoints       = InpTrailStep;

      SPartialConfig pc;
      pc.enabled = InpPartialEnabled;
      pc.levelR[0] = InpPartial1R;  pc.closePct[0] = InpPartial1Pct;
      pc.levelR[1] = InpPartial2R;  pc.closePct[1] = InpPartial2Pct;
      pc.levelR[2] = InpPartial3R;  pc.closePct[2] = InpPartial3Pct;

      m_protection.Configure(sl, be, tr, pc);

      SRiskLimits limits;
      limits.maxDailyLossPct = InpMaxDailyLossPct;
      limits.maxDrawdownPct  = InpMaxDrawdownPct;
      limits.minEquity       = InpMinEquity;
      limits.minMarginLevel  = InpMinMarginLevel;
      m_guard.Configure(limits);

      SExecutionConfig ex;
      ex.maxRetries   = InpMaxRetries;
      ex.retryDelayMs = InpRetryDelayMs;
      ex.laterDelayMs = InpRetryDelayMs * 10;
      ex.cooldownMs   = InpCooldownMs;
      ex.maxOrderLot  = InpMaxOrderLot;
      m_exec.Configure(ex);

      m_dispatch.Configure(InpMinProcessMs, InpCooldownMs, InpCloseAllOnTrip, InpBEOffsetR);

      m_dispatch.SetOrderMagic(InpMagicFilter >= 0 ? InpMagicFilter : 0);
      m_sessions.Configure(InpSydneyStart, InpSydneyEnd, InpTokyoStart, InpTokyoEnd,
                           InpLondonStart, InpLondonEnd, InpNewYorkStart, InpNewYorkEnd);
   }

   void UpdatePanel()
   {
      if(!InpShowPanel)
         return;

      m_sessions.Update();
      m_panel.SetClock(m_sessions.Clock(), m_sessions.Weekend() ? C'240,190,80' : clrSilver);
      for(int s = 0; s < TM_SESSIONS; s++)
         m_panel.SetSession(s, m_sessions.Text(s), m_sessions.IsOpen(s) ? C'110,210,130' : clrGray);

      CPositionRegistry *reg = m_positions.Registry();
      const int n = reg.Count();
      const int slots = TM_PANEL_ROWS;

      for(int i = 0; i < slots; i++)
      {
         if(i >= n)
         {
            const string hint = (i == 0) ? StringFormat("No managed positions (account has %d open; check magic / symbol scope)",
                                                        m_broker.PositionCount()) : "";
            m_panel.SetRow(i, 0, hint, C'240,190,80', 0.0, 0.0, 5);
            continue;
         }
         CManagedPosition *p = reg.At(i);
         m_panel.SetRow(i, p.ticket,
                        StringFormat("#%I64u %s %s %.2f %.2f", p.ticket, p.symbol,
                                     p.IsBuy() ? "B" : "S", p.volume, p.profit),
                        p.profit >= 0.0 ? C'110,210,130' : C'235,110,110',
                        p.sl, p.tp, (int)SymbolInfoInteger(p.symbol, SYMBOL_DIGITS));
      }

      m_panel.Render(n, m_risk.exposure.openRiskMoney, m_risk.exposure.openRiskPct,
                     m_risk.account.dailyPL, m_risk.account.dailyPLPct, m_risk.drawdownPct,
                     TM_ProtectionText(m_guard.Status()), m_guard.IsProtectionActive(),
                     m_protection.BEEnabled(), m_protection.TrailingEnabled(), m_protection.PartialEnabled(),
                     m_dispatch.IsPaused());
   }

public:
   int Initialize()
   {
      Logger.SetLevel(InpLogLevel);

      string why;
      if(!m_life.ValidateInputs(why))
      {
         Logger.Error("Engine", "invalid inputs: " + why);
         return INIT_PARAMETERS_INCORRECT;
      }
      if(!m_broker.IsTradeAllowed())
         Logger.Warn("Engine", "trading is not currently allowed; the manager will observe only until it is");

      Wire();
      Configure();

      if(!m_life.StartTimer(InpTimerMs))
      {
         Logger.Error("Engine", "could not start the timer");
         return INIT_FAILED;
      }

      m_positions.Synchronize();   // adopts open positions and recovers their state
      m_risk.Refresh(true);
      m_state.Flush();
      if(InpShowPanel)
         m_panel.Create((int)m_storage.LoadValue("PANEL_X", InpPanelX),
                        (int)m_storage.LoadValue("PANEL_Y", InpPanelY), InpDefaultLot);
      UpdatePanel();
      Logger.Info("Engine", StringFormat("started, managing %d position(s)", m_positions.Registry().Count()));
      return INIT_SUCCEEDED;
   }

   void OnTick()
   {
      m_dispatch.HandleTick();
   }

   void OnTimer()
   {
      m_dispatch.HandleTimer();
      UpdatePanel();
   }

   void OnTradeTransaction(const MqlTradeTransaction &trans,
                           const MqlTradeRequest &request,
                           const MqlTradeResult &result)
   {
      m_dispatch.HandleTradeTransaction(trans);
   }

   void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
   {
      if(InpShowPanel && id == CHARTEVENT_MOUSE_MOVE)
      {
         if(m_panel.HandleMouse(id, lparam, dparam, sparam) == 2)
         {
            m_storage.SaveValue("PANEL_X", m_panel.X());
            m_storage.SaveValue("PANEL_Y", m_panel.Y());
         }
         return;
      }
      if(!InpShowPanel || (id != CHARTEVENT_OBJECT_CLICK && id != CHARTEVENT_OBJECT_ENDEDIT))
         return;

      switch(m_panel.HandleEvent(id, lparam, dparam, sparam))
      {
         case PANEL_TOGGLE_BE:
            m_protection.SetBEEnabled(!m_protection.BEEnabled());
            Logger.Info("Panel", StringFormat("break-even %s", m_protection.BEEnabled() ? "ON" : "OFF"));
            break;
         case PANEL_TOGGLE_TRAIL:
            m_protection.SetTrailingEnabled(!m_protection.TrailingEnabled());
            Logger.Info("Panel", StringFormat("trailing %s", m_protection.TrailingEnabled() ? "ON" : "OFF"));
            break;
         case PANEL_TOGGLE_PARTIAL:
            m_protection.SetPartialEnabled(!m_protection.PartialEnabled());
            Logger.Info("Panel", StringFormat("partial close %s", m_protection.PartialEnabled() ? "ON" : "OFF"));
            break;
         case PANEL_TOGGLE_PAUSE:
            m_dispatch.SetPaused(!m_dispatch.IsPaused());
            Logger.Info("Panel", m_dispatch.IsPaused() ? "automation paused" : "automation resumed");
            break;
         case PANEL_BE_ALL:
            m_dispatch.ManualBreakEven();
            break;
         case PANEL_CLOSE_HALF:
            m_dispatch.ManualPartial(50.0);
            break;
         case PANEL_CLOSE_ALL:
            m_dispatch.ManualCloseAll();
            break;
         case PANEL_ORDER:
         {
            ENUM_ORDER_TYPE type = ORDER_TYPE_BUY;
            double lot = 0.0, price = 0.0, sl = 0.0, tp = 0.0;
            if(m_panel.TakeOrder(type, lot, price, sl, tp))
            {
               string msg;
               const bool ok = m_dispatch.ManualOrder(type, lot, price, sl, tp, _Symbol, msg);
               m_panel.SetStatus(msg, ok ? C'110,210,130' : C'235,110,110');
            }
            else
               m_panel.SetStatus("Order fields must be plain numbers and the lot above 0", C'240,190,80');
            break;
         }
         case PANEL_SET_LEVELS:
         {
            ulong ticket = 0;
            double sl = 0.0, tp = 0.0;
            if(m_panel.TakeLevels(ticket, sl, tp))
               m_dispatch.ManualSetLevels(ticket, sl, tp);
            break;
         }
         default:
            break;
      }
      UpdatePanel();
   }

   void Shutdown(const int reason)
   {
      m_life.StopTimer();
      m_state.Flush();
      m_panel.Destroy();
      Logger.Info("Engine", StringFormat("stopped (reason %d)", reason));
   }
};

#endif
