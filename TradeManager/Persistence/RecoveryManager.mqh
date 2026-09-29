#ifndef TM_RECOVERYMANAGER_MQH
#define TM_RECOVERYMANAGER_MQH

#include "StateStorage.mqh"
#include "../Position/PositionRegistry.mqh"
#include "../Utils/Logger.mqh"

// Rebuilds management state after a restart. The live MT5 position always wins over
// what was stored: stored state is only accepted if it still matches reality.
class CRecoveryManager
{
private:
   CStateStorage *m_storage;

public:
   CRecoveryManager() { m_storage = NULL; }

   void Attach(CStateStorage *storage) { m_storage = storage; }

   // Called once when a position enters the registry.
   void Restore(CManagedPosition *p)
   {
      SStoredState s;
      const bool have = m_storage.Load(p.ticket, s) &&
                        s.openTime == p.openTime &&
                        s.initialVolume >= p.volume - TM_EPS;

      if(have)
      {
         p.initialSL     = s.initialSL;
         p.initialRisk   = s.initialRisk;
         p.initialVolume = s.initialVolume;
         p.flags         = s.flags;
         p.partialMask   = s.partialMask;
         Logger.Info("Recovery", StringFormat("#%I64u restored: BE=%d partialMask=%d trailing=%d",
                     p.ticket, (int)p.HasFlag(TM_FLAG_BE), p.partialMask, (int)p.HasFlag(TM_FLAG_TRAILING)));
      }
      else
      {
         m_storage.Delete(p.ticket);
         p.initialVolume = p.volume;
         if(p.sl > 0.0 && p.IsRiskSideSL(p.sl))
            p.SetInitialSL(p.sl);
      }

      // A stop already at or beyond the entry can only mean break-even was reached.
      if(!p.HasFlag(TM_FLAG_BE) && p.sl > 0.0 && !p.IsRiskSideSL(p.sl))
         p.SetFlag(TM_FLAG_BE);

      p.dirty = true;
      p.ResolveState();
   }

   void Persist(CManagedPosition *p)
   {
      SStoredState s;
      s.initialSL     = p.initialSL;
      s.initialRisk   = p.initialRisk;
      s.initialVolume = p.initialVolume;
      s.flags         = p.flags;
      s.partialMask   = p.partialMask;
      s.openTime      = p.openTime;
      if(m_storage.Save(p.ticket, s))
         p.dirty = false;
   }

   void Forget(const ulong ticket) { m_storage.Delete(ticket); }

   // Drops stored state for tickets that are no longer open.
   void PurgeOrphans(CPositionRegistry *registry)
   {
      ulong tickets[];
      const int n = m_storage.ListTickets(tickets);
      for(int i = 0; i < n; i++)
      {
         if(registry.Find(tickets[i]) == NULL && !PositionSelectByTicket(tickets[i]))
         {
            m_storage.Delete(tickets[i]);
            Logger.Debug("Recovery", StringFormat("purged stale state for #%I64u", tickets[i]));
         }
      }
   }
};

#endif
