#ifndef TM_POSITIONSCANNER_MQH
#define TM_POSITIONSCANNER_MQH

#include "../Broker/BrokerAdapter.mqh"

// Reads the open positions that fall inside the configured scope.
class CPositionScanner
{
private:
   CBrokerAdapter *m_broker;
   long            m_magic;        // -1 = every magic number
   bool            m_chartOnly;

public:
   CPositionScanner() { m_broker = NULL; m_magic = -1; m_chartOnly = false; }

   void Attach(CBrokerAdapter *broker) { m_broker = broker; }

   void Configure(const long magicFilter, const bool chartSymbolOnly)
   {
      m_magic     = magicFilter;
      m_chartOnly = chartSymbolOnly;
   }

   bool InScope(const SPositionSnapshot &s) const
   {
      if(m_magic >= 0 && s.magic != m_magic)
         return false;
      if(m_chartOnly && s.symbol != _Symbol)
         return false;
      return true;
   }

   int Scan(SPositionSnapshot &out[])
   {
      ArrayResize(out, 0);
      const int total = m_broker.PositionCount();
      for(int i = 0; i < total; i++)
      {
         SPositionSnapshot s;
         if(!m_broker.PositionAt(i, s) || !InScope(s))
            continue;
         const int k = ArraySize(out);
         ArrayResize(out, k + 1);
         out[k] = s;
      }
      return ArraySize(out);
   }
};

#endif
