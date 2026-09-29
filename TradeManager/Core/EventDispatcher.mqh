#ifndef TM_EVENTDISPATCHER_MQH
#define TM_EVENTDISPATCHER_MQH

#include "StateManager.mqh"
#include "../Position/PositionEngine.mqh"
#include "../Protection/ProtectionEngine.mqh"
#include "../Risk/RiskEngine.mqh"
#include "../Risk/RiskGuard.mqh"
#include "../Execution/ExecutionEngine.mqh"

// Routes each MT5 event to the right modules and runs the fixed pipeline:
//   registry -> protection -> risk guard -> execution -> state.
class CEventDispatcher
{
private:
   CPositionEngine   *m_positions;
   CProtectionEngine *m_protection;
   CRiskEngine       *m_risk;
   CRiskGuard        *m_guard;
   CExecutionEngine  *m_exec;
   CStateManager     *m_state;

   ulong m_lastPassMs;
   ulong m_minPassMs;
   int   m_deferMs;
   bool  m_closeAllOnTrip;
   bool  m_paused;
   double m_beOffsetR;

   void ApplySuccesses(SExecOutcome &done[])
   {
      for(int i = 0; i < ArraySize(done); i++)
         m_protection.OnExecuted(done[i].req);
   }

   // Guard check, then execution. Returns silently if the same request is already waiting.
   void Dispatch(SExecRequest &req)
   {
      CManagedPosition *p = m_positions.Registry().Find(req.ticket);
      if(p == NULL || m_exec.IsBusy(req.ticket, req.type))
         return;

      string why = "";
      bool allowed = false;
      switch(req.type)
      {
         case EXEC_MODIFY_SL:     allowed = m_guard.CanModify(p, req.sl, why); break;
         case EXEC_PARTIAL_CLOSE: allowed = m_guard.CanPartialClose(p, req.volume, why); break;
         case EXEC_CLOSE:         allowed = m_guard.CanClose(p, why); break;
         default:                 allowed = m_guard.CanAct(why); break;
      }
      if(!allowed)
      {
         Logger.Debug("Guard", StringFormat("#%I64u %s blocked: %s", req.ticket, TM_ExecTypeText(req.type), why));
         m_exec.Defer(req, m_deferMs);
         return;
      }

      SExecOutcome out;
      if(m_exec.Submit(req, out))
         m_protection.OnExecuted(out.req);
   }

   void CloseAllManaged(const string reason)
   {
      CRequestBuilder builder;
      CPositionRegistry *reg = m_positions.Registry();
      for(int i = 0; i < reg.Count(); i++)
      {
         CManagedPosition *p = reg.At(i);
         SExecRequest r;
         builder.Close(p.ticket, -1, reason, r);
         string why;
         if(!m_guard.CanClose(p, why))
         {
            Logger.Warn("Guard", StringFormat("cannot close #%I64u: %s", p.ticket, why));
            continue;
         }
         SExecOutcome out;
         m_exec.Submit(r, out);
      }
   }

   void EvaluateGuard()
   {
      if(m_guard.Evaluate(m_risk.account, m_risk.drawdownPct))
      {
         const string text = TM_ProtectionText(m_guard.Status());
         Logger.Error("Guard", "TRADING PROTECTION: " + text);
         Alert("Trade Manager: TRADING PROTECTION - ", text);
         if(m_closeAllOnTrip)
            CloseAllManaged("protection: " + text);
      }
   }

   void RunCycle(const bool force)
   {
      const ulong now = TM_NowMs();
      if(!force && now - m_lastPassMs < m_minPassMs)
         return;
      m_lastPassMs = now;

      m_risk.Refresh(false);
      EvaluateGuard();

      if(!m_paused)
      {
         SExecOutcome done[];
         m_exec.ProcessRetries(done);
         ApplySuccesses(done);

         SExecRequest reqs[];
         const int n = m_protection.Process(reqs);
         for(int i = 0; i < n; i++)
            Dispatch(reqs[i]);
      }

      m_state.Flush();

      if(m_exec.ConsumeRefreshRequest())
         m_positions.Synchronize();
   }

public:
   CEventDispatcher()
   {
      m_positions = NULL; m_protection = NULL; m_risk = NULL; m_guard = NULL; m_exec = NULL; m_state = NULL;
      m_lastPassMs = 0; m_minPassMs = 100; m_deferMs = 3000; m_closeAllOnTrip = false;
      m_paused = false; m_beOffsetR = 0.0;
   }

   void Attach(CPositionEngine *positions, CProtectionEngine *protection, CRiskEngine *risk,
               CRiskGuard *guard, CExecutionEngine *exec, CStateManager *state)
   {
      m_positions = positions; m_protection = protection; m_risk = risk;
      m_guard = guard; m_exec = exec; m_state = state;
   }

   void Configure(const int minPassMs, const int deferMs, const bool closeAllOnTrip, const double beOffsetR)
   {
      m_beOffsetR = beOffsetR;
      m_minPassMs = (ulong)minPassMs;
      m_deferMs = deferMs;
      m_closeAllOnTrip = closeAllOnTrip;
   }

   // ---- manual actions (chart panel) ---------------------------------------
   // While paused, no automatic action is taken; manual actions still work.
   void SetPaused(const bool paused) { m_paused = paused; }
   bool IsPaused() const { return m_paused; }

   void ManualCloseAll()
   {
      Logger.Info("Manual", "close all managed positions");
      CloseAllManaged("manual close all");
   }

   // Moves each stop to entry (+ configured offset). Positions not far enough in profit are refused by validation.
   void ManualBreakEven()
   {
      Logger.Info("Manual", "break-even on all managed positions");
      CRequestBuilder builder;
      CPositionRegistry *reg = m_positions.Registry();
      for(int i = 0; i < reg.Count(); i++)
      {
         CManagedPosition *p = reg.At(i);
         const double lock = p.initialRisk * m_beOffsetR;
         SExecRequest r;
         builder.ModifySL(p.ticket, p.IsBuy() ? p.entry + lock : p.entry - lock, TM_FLAG_BE, "manual break-even", r);
         Dispatch(r);
      }
      m_state.Flush();
   }

   // SL/TP typed on the panel. Unlike automation, this may widen or remove a level;
   // it is still checked against the broker's stop and freeze rules.
   void ManualSetLevels(const ulong ticket, const double sl, const double tp)
   {
      string why;
      if(!m_guard.CanAct(why))
      {
         Logger.Warn("Manual", "levels not sent: " + why);
         return;
      }
      CRequestBuilder builder;
      SExecRequest r;
      builder.ModifyLevels(ticket, sl, tp, "manual levels", r);
      SExecOutcome out;
      if(m_exec.Submit(r, out))
         m_protection.OnExecuted(out.req);
      else
         Logger.Warn("Manual", StringFormat("#%I64u SL/TP not applied: %s", ticket, out.message));
      m_state.Flush();
   }

   void ManualPartial(const double percent)
   {
      Logger.Info("Manual", StringFormat("close %.0f%% of every managed position", percent));
      CRequestBuilder builder;
      CPositionRegistry *reg = m_positions.Registry();
      for(int i = 0; i < reg.Count(); i++)
      {
         CManagedPosition *p = reg.At(i);
         SExecRequest r;
         builder.PartialClose(p.ticket, p.volume * percent / 100.0, -1, "manual partial", r);
         Dispatch(r);
      }
      m_state.Flush();
   }

   // Tick: break-even, trailing, partials, retries.
   void HandleTick()
   {
      RunCycle(false);
   }

   // Timer: resynchronize with the account, refresh risk, cover symbols that are not ticking.
   void HandleTimer()
   {
      m_positions.Synchronize();
      m_risk.Refresh(true);
      RunCycle(true);
      m_state.Purge();
   }

   // Trade events keep the registry in step with MT5 without waiting for the timer.
   void HandleTradeTransaction(const MqlTradeTransaction &trans)
   {
      switch(trans.type)
      {
         case TRADE_TRANSACTION_DEAL_ADD:
            m_positions.Synchronize();
            m_risk.Refresh(true);
            EvaluateGuard();
            m_state.Flush();
            break;
         case TRADE_TRANSACTION_POSITION:
            m_positions.Synchronize();
            m_state.Flush();
            break;
         default:
            break;
      }
   }
};

#endif
