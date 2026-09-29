#ifndef TM_POSITIONSYNCHRONIZER_MQH
#define TM_POSITIONSYNCHRONIZER_MQH

#include "PositionScanner.mqh"
#include "PositionRegistry.mqh"
#include "../Persistence/RecoveryManager.mqh"
#include "../Utils/Logger.mqh"

// Makes the registry mirror the real account: adopts new positions, refreshes live
// fields, and forgets positions that are gone.
class CPositionSynchronizer
{
private:
   CPositionScanner  *m_scanner;
   CPositionRegistry *m_registry;
   CRecoveryManager  *m_recovery;

public:
   CPositionSynchronizer() { m_scanner = NULL; m_registry = NULL; m_recovery = NULL; }

   void Attach(CPositionScanner *scanner, CPositionRegistry *registry, CRecoveryManager *recovery)
   {
      m_scanner  = scanner;
      m_registry = registry;
      m_recovery = recovery;
   }

   void Sync()
   {
      SPositionSnapshot snaps[];
      const int n = m_scanner.Scan(snaps);

      for(int i = 0; i < m_registry.Count(); i++)
         m_registry.At(i).seen = false;

      for(int i = 0; i < n; i++)
      {
         CManagedPosition *p = m_registry.Find(snaps[i].ticket);
         if(p == NULL)
         {
            p = m_registry.Add(snaps[i]);
            if(p == NULL)
               continue;
            p.ApplySnapshot(snaps[i]);
            m_recovery.Restore(p);
            Logger.Info("Sync", StringFormat("adopted #%I64u %s %s %.2f lots SL=%s",
                        p.ticket, p.symbol, p.IsBuy() ? "BUY" : "SELL", p.volume,
                        DoubleToString(p.sl, (int)SymbolInfoInteger(p.symbol, SYMBOL_DIGITS))));
         }
         else
            p.ApplySnapshot(snaps[i]);
         p.seen = true;
      }

      for(int i = m_registry.Count() - 1; i >= 0; i--)
      {
         CManagedPosition *p = m_registry.At(i);
         if(p.seen)
            continue;
         Logger.Info("Sync", StringFormat("#%I64u is no longer open", p.ticket));
         m_recovery.Forget(p.ticket);
         m_registry.RemoveAt(i);
      }
   }
};

#endif
