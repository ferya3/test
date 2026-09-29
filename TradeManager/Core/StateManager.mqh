#ifndef TM_STATEMANAGER_MQH
#define TM_STATEMANAGER_MQH

#include "../Position/PositionRegistry.mqh"
#include "../Persistence/RecoveryManager.mqh"
#include "../Utils/TimeUtils.mqh"

// Writes changed position state to storage and cleans up after closed positions.
class CStateManager
{
private:
   CPositionRegistry *m_registry;
   CRecoveryManager  *m_recovery;
   ulong              m_lastPurgeMs;

public:
   CStateManager() { m_registry = NULL; m_recovery = NULL; m_lastPurgeMs = 0; }

   void Attach(CPositionRegistry *registry, CRecoveryManager *recovery)
   {
      m_registry = registry;
      m_recovery = recovery;
   }

   void Flush()
   {
      for(int i = 0; i < m_registry.Count(); i++)
      {
         CManagedPosition *p = m_registry.At(i);
         if(p.dirty)
            m_recovery.Persist(p);
      }
   }

   // Stale state is only cleaned up once a minute.
   void Purge()
   {
      const ulong now = TM_NowMs();
      if(now - m_lastPurgeMs < 60000)
         return;
      m_lastPurgeMs = now;
      m_recovery.PurgeOrphans(m_registry);
   }
};

#endif
