#ifndef TM_EXECUTIONENGINE_MQH
#define TM_EXECUTIONENGINE_MQH

#include "RequestBuilder.mqh"
#include "ErrorHandler.mqh"
#include "RetryManager.mqh"
#include "ExecutionValidator.mqh"
#include "../Broker/BrokerAdapter.mqh"
#include "../Utils/Logger.mqh"

struct SExecutionConfig
{
   int maxRetries;       // attempts after the first failure
   int retryDelayMs;     // for transient errors
   int laterDelayMs;     // for market-state errors
   int cooldownMs;       // after a non-retryable failure or after giving up
   double maxOrderLot;   // cap for panel orders, 0 = none
};

struct SExecOutcome
{
   SExecRequest    req;
   bool            success;
   bool            deferred;     // not attempted: same request is in retry/cooldown
   ENUM_ERR_ACTION action;
   uint            retcode;
   string          message;
};

// Request -> validate -> CTrade -> classify the result -> retry or cool down.
class CExecutionEngine
{
private:
   CBrokerAdapter     *m_broker;
   CExecutionValidator m_validator;
   CErrorHandler       m_errors;
   CRetryManager       m_retry;
   CRequestBuilder     m_builder;
   SExecutionConfig    m_cfg;
   bool                m_refresh;

   void Send(const SExecRequest &req, uint &retcode, int &error)
   {
      SPositionSnapshot live;
      if(!m_broker.PositionByTicket(req.ticket, live))
      {
         retcode = TRADE_RETCODE_POSITION_CLOSED;
         error = 0;
         return;
      }

      // Modify always re-sends the other level unchanged, read fresh just now.
      switch(req.type)
      {
         case EXEC_MODIFY_SL:     m_broker.ModifyPosition(req.ticket, req.sl, live.tp); break;
         case EXEC_MODIFY_TP:     m_broker.ModifyPosition(req.ticket, live.sl, req.tp); break;
         case EXEC_MODIFY_LEVELS: m_broker.ModifyPosition(req.ticket, req.sl, req.tp); break;
         case EXEC_CLOSE:         m_broker.ClosePosition(req.ticket, 0.0); break;
         case EXEC_PARTIAL_CLOSE: m_broker.ClosePosition(req.ticket, req.volume); break;
      }
      retcode = m_broker.LastRetcode();
      error   = m_broker.LastError();
   }

   void ScheduleRetry(const SExecRequest &req, const int attempts, const int delayMs)
   {
      if(attempts > m_cfg.maxRetries)
      {
         Logger.Warn("Exec", StringFormat("giving up on #%I64u %s after %d attempts",
                     req.ticket, TM_ExecTypeText(req.type), attempts));
         m_retry.Cooldown(req, (ulong)m_cfg.cooldownMs);
         return;
      }
      m_retry.Schedule(req, attempts, (ulong)delayMs);
   }

   void HandleFailure(const SExecRequest &req, const int attempt, const ENUM_ERR_ACTION action)
   {
      // A request the user typed is reported and dropped, so they can correct it and try again at once.
      if(req.manual)
      {
         if(action == EXA_REFRESH_STATE)
            m_refresh = true;
         return;
      }
      switch(action)
      {
         case EXA_RETRY_NOW:
            ScheduleRetry(req, attempt + 1, m_cfg.retryDelayMs);
            break;
         case EXA_RETRY_LATER:
            ScheduleRetry(req, attempt + 1, m_cfg.laterDelayMs);
            break;
         case EXA_REFRESH_STATE:
            m_refresh = true;
            m_retry.Cooldown(req, 1000);
            break;
         default:
            m_retry.Cooldown(req, (ulong)m_cfg.cooldownMs);
            break;
      }
   }

   void Attempt(SExecRequest &req, const int attempt, SExecOutcome &out)
   {
      out.req = req;
      out.success = false;
      out.deferred = false;
      out.action = EXA_NO_RETRY;
      out.retcode = 0;
      out.message = "";

      string why;
      ENUM_ERR_ACTION action;
      if(!m_validator.Validate(req, why, action))
      {
         out.req = req;
         out.action = action;
         out.message = why;
         Logger.Warn("Exec", StringFormat("#%I64u %s rejected before sending: %s",
                     req.ticket, TM_ExecTypeText(req.type), why));
         HandleFailure(req, attempt, action);
         return;
      }
      out.req = req;

      uint retcode = 0;
      int error = 0;
      Send(req, retcode, error);
      action = m_errors.Classify(retcode, error);
      out.retcode = retcode;
      out.action = action;
      out.message = m_errors.Describe(retcode);

      if(action == EXA_SUCCESS)
      {
         out.success = true;
         m_retry.Clear(req.ticket, req.type);
         Logger.Info("Exec", StringFormat("#%I64u %s ok (%s) sl=%.5f vol=%.2f",
                     req.ticket, TM_ExecTypeText(req.type), req.reason, req.sl, req.volume));
         return;
      }

      Logger.Warn("Exec", StringFormat("#%I64u %s failed: %s (err %d)",
                  req.ticket, TM_ExecTypeText(req.type), out.message, error));
      HandleFailure(req, attempt, action);
   }

public:
   CExecutionEngine()
   {
      m_broker = NULL;
      m_refresh = false;
      m_cfg.maxRetries = 3; m_cfg.retryDelayMs = 500; m_cfg.laterDelayMs = 5000; m_cfg.cooldownMs = 3000; m_cfg.maxOrderLot = 0.0;
   }

   void Attach(CBrokerAdapter *broker)
   {
      m_broker = broker;
      m_validator.Attach(broker);
   }

   void Configure(const SExecutionConfig &cfg) { m_cfg = cfg; }

   bool ValidateRequest(SExecRequest &req, string &why)
   {
      ENUM_ERR_ACTION action;
      return m_validator.Validate(req, why, action);
   }

   // Sends a request unless the same one is already waiting for a retry or cooling down.
   bool Submit(SExecRequest &req, SExecOutcome &out)
   {
      if(!req.manual && m_retry.IsBlocked(req.ticket, req.type))
      {
         out.req = req;
         out.success = false;
         out.deferred = true;
         out.action = EXA_NO_RETRY;
         out.retcode = 0;
         out.message = "deferred";
         return false;
      }
      Attempt(req, 0, out);
      return out.success;
   }

   bool IsBusy(const ulong ticket, const ENUM_EXEC_TYPE type) const
   {
      return m_retry.IsBlocked(ticket, type);
   }

   // Holds a request back without sending it (e.g. blocked by the risk guard).
   void Defer(const SExecRequest &req, const int ms)
   {
      m_retry.Cooldown(req, (ulong)ms);
   }

   // Re-sends whatever is due. Successful outcomes are returned so the caller can update state.
   void ProcessRetries(SExecOutcome &done[])
   {
      ArrayResize(done, 0);
      m_retry.Prune();

      SRetryEntry e;
      int guard = 0;
      while(guard < 16 && m_retry.PopDue(e))
      {
         guard++;
         SExecOutcome o;
         Attempt(e.req, e.attempts, o);
         if(o.success)
         {
            const int k = ArraySize(done);
            ArrayResize(done, k + 1);
            done[k] = o;
         }
      }
   }

   // True once after a failure that means the registry is out of date.
   bool ConsumeRefreshRequest()
   {
      const bool r = m_refresh;
      m_refresh = false;
      return r;
   }

   // A new order from the panel. Validated, sent once, never retried: the user decides whether to press again.
   bool PlaceOrder(SOrderRequest &req, string &msg)
   {
      string why;
      if(!m_validator.ValidateOrder(req, m_cfg.maxOrderLot, why))
      {
         msg = TM_OrderText(req.type) + " rejected: " + why;
         Logger.Warn("Order", msg);
         return false;
      }
      m_broker.SendOrder(req.type, req.symbol, req.volume, req.price, req.sl, req.tp, req.magic, req.comment);
      const uint rc = m_broker.LastRetcode();
      const ENUM_ERR_ACTION action = m_errors.Classify(rc, m_broker.LastError());
      if(action == EXA_SUCCESS)
      {
         msg = StringFormat("%s %.2f %s sent", TM_OrderText(req.type), req.volume, req.symbol);
         Logger.Info("Order", msg);
         return true;
      }
      msg = StringFormat("%s failed: %s", TM_OrderText(req.type), m_errors.Describe(rc));
      Logger.Warn("Order", msg);
      return false;
   }

   // ---- convenience wrappers ------------------------------------------------
   bool ModifySL(const ulong ticket, const double sl, SExecOutcome &out)
   {
      SExecRequest r;
      m_builder.ModifySL(ticket, sl, 0, "manual", r);
      return Submit(r, out);
   }

   bool ModifyTP(const ulong ticket, const double tp, SExecOutcome &out)
   {
      SExecRequest r;
      m_builder.ModifyTP(ticket, tp, "manual", r);
      return Submit(r, out);
   }

   bool Close(const ulong ticket, SExecOutcome &out)
   {
      SExecRequest r;
      m_builder.Close(ticket, -1, "manual", r);
      return Submit(r, out);
   }

   bool PartialClose(const ulong ticket, const double volume, SExecOutcome &out)
   {
      SExecRequest r;
      m_builder.PartialClose(ticket, volume, -1, "manual", r);
      return Submit(r, out);
   }
};

#endif
