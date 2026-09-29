#ifndef TM_POSITIONENGINE_MQH
#define TM_POSITIONENGINE_MQH

#include "PositionScanner.mqh"
#include "PositionRegistry.mqh"
#include "PositionSynchronizer.mqh"

// Facade over scanner, registry and synchronizer.
class CPositionEngine
{
private:
   CPositionScanner      m_scanner;
   CPositionRegistry     m_registry;
   CPositionSynchronizer m_sync;

public:
   void Attach(CBrokerAdapter *broker, CRecoveryManager *recovery)
   {
      m_scanner.Attach(broker);
      m_sync.Attach(GetPointer(m_scanner), GetPointer(m_registry), recovery);
   }

   void Configure(const long magicFilter, const bool chartSymbolOnly)
   {
      m_scanner.Configure(magicFilter, chartSymbolOnly);
   }

   void Synchronize() { m_sync.Sync(); }

   CPositionRegistry *Registry() { return GetPointer(m_registry); }
};

#endif
