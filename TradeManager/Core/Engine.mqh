#ifndef TM_ENGINE_MQH
#define TM_ENGINE_MQH

#include "Config.mqh"
#include "Lifecycle.mqh"
#include "StateManager.mqh"
#include "EventDispatcher.mqh"

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
      m_exec.Configure(ex);

      m_dispatch.Configure(InpMinProcessMs, InpCooldownMs, InpCloseAllOnTrip);
   }

   void UpdatePanel()
   {
      if(!InpShowPanel)
         return;

      CPositionRegistry *reg = m_positions.Registry();
      string s = "Trade Manager\n";
      s += StringFormat("Positions: %d   Open risk: %.2f (%.2f%%)   Daily P/L: %.2f (%.2f%%)\n",
                        reg.Count(), m_risk.exposure.openRiskMoney, m_risk.exposure.openRiskPct,
                        m_risk.account.dailyPL, m_risk.account.dailyPLPct);
      s += StringFormat("Drawdown: %.2f%%   Protection: %s\n", m_risk.drawdownPct, TM_ProtectionText(m_guard.Status()));

      const int shown = MathMin(reg.Count(), 10);
      for(int i = 0; i < shown; i++)
      {
         CManagedPosition *p = reg.At(i);
         s += StringFormat("#%I64u %s %s %.2f  P/L %.2f  %s\n", p.ticket, p.symbol,
                           p.IsBuy() ? "BUY" : "SELL", p.volume, p.profit, TM_StateText(p.state));
      }
      if(reg.Count() > shown)
         s += StringFormat("... and %d more\n", reg.Count() - shown);
      Comment(s);
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

   void Shutdown(const int reason)
   {
      m_life.StopTimer();
      m_state.Flush();
      Comment("");
      Logger.Info("Engine", StringFormat("stopped (reason %d)", reason));
   }
};

#endif
