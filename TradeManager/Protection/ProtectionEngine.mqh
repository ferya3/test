#ifndef TM_PROTECTIONENGINE_MQH
#define TM_PROTECTIONENGINE_MQH

#include "StopLossManager.mqh"
#include "BreakEvenManager.mqh"
#include "TrailingManager.mqh"
#include "PartialCloseManager.mqh"
#include "../Position/PositionRegistry.mqh"

// Decides what should happen to each managed position. It only produces requests;
// the risk guard and the execution engine decide whether and how they are sent.
class CProtectionEngine
{
private:
   CBrokerAdapter    *m_broker;
   CPositionRegistry *m_registry;

   CStopLossManager     m_sl;
   CBreakEvenManager    m_be;
   CTrailingManager     m_trailing;
   CPartialCloseManager m_partial;

   void Push(SExecRequest &out[], const SExecRequest &r)
   {
      const int k = ArraySize(out);
      ArrayResize(out, k + 1);
      out[k] = r;
   }

public:
   CProtectionEngine() { m_broker = NULL; m_registry = NULL; }

   void Attach(CBrokerAdapter *broker, CPositionRegistry *registry)
   {
      m_broker = broker;
      m_registry = registry;
   }

   void Configure(const SStopLossConfig &sl, const SBreakEvenConfig &be,
                  const STrailingConfig &trail, const SPartialConfig &partial)
   {
      m_sl.Configure(sl);
      m_be.Configure(be);
      m_trailing.Configure(trail);
      m_partial.Configure(partial);
   }

   CTrailingManager *Trailing() { return GetPointer(m_trailing); }

   // At most one request per position per pass:
   //   partial close  >  initial SL  >  the best of break-even / trailing
   int Process(SExecRequest &out[])
   {
      ArrayResize(out, 0);

      for(int i = 0; i < m_registry.Count(); i++)
      {
         CManagedPosition *p = m_registry.At(i);
         if(p == NULL)
            continue;

         SSymbolRules rules;
         SVolumeRules vol;
         double bid, ask;
         if(!m_broker.LoadRules(p.symbol, rules, vol) || !m_broker.Tick(p.symbol, bid, ask))
            continue;

         SExecRequest r;

         if(m_partial.Propose(p, rules, vol, bid, ask, r))
         {
            Push(out, r);
            continue;
         }

         // Everything below modifies the position, which MT5 forbids inside the freeze level.
         if(rules.IsFrozen(p.IsBuy(), p.sl, p.tp, bid, ask))
            continue;

         if(m_sl.ProposeInitial(p, rules, bid, ask, r))
         {
            Push(out, r);
            continue;
         }

         SExecRequest be, tr;
         const bool hasBE = m_be.Propose(p, rules, bid, ask, be);
         const bool hasTR = m_trailing.Propose(p, rules, bid, ask, tr);

         if(hasBE && hasTR)
         {
            // One modification carries both: the tighter stop wins, and satisfies both.
            SExecRequest best = be;
            if(TM_IsBetterSL(p.IsBuy(), tr.sl, be.sl))
               best = tr;
            best.flags = be.flags | tr.flags;
            Push(out, best);
         }
         else if(hasBE)
            Push(out, be);
         else if(hasTR)
            Push(out, tr);
      }
      return ArraySize(out);
   }

   // Applies a successful request to the position's state.
   void OnExecuted(const SExecRequest &req)
   {
      CManagedPosition *p = m_registry.Find(req.ticket);
      if(p == NULL)
         return;

      switch(req.type)
      {
         case EXEC_MODIFY_SL:
            p.sl = req.sl;
            if(req.initial)
               p.SetInitialSL(req.sl);
            p.SetFlag(req.flags);
            break;
         case EXEC_MODIFY_TP:
            p.tp = req.tp;
            break;
         case EXEC_PARTIAL_CLOSE:
            p.volume -= req.volume;
            p.MarkPartial(req.level);
            break;
         case EXEC_CLOSE:
            p.MarkPartial(req.level);
            break;
      }
      p.ResolveState();
   }
};

#endif
