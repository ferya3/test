#ifndef TM_DRAWDOWNMANAGER_MQH
#define TM_DRAWDOWNMANAGER_MQH

#include "../Persistence/StateStorage.mqh"

// Tracks the equity high-water mark (persisted across restarts) and the drawdown from it.
// To reset the peak, delete the terminal global variable TM_<login>_PEAK.
class CDrawdownManager
{
private:
   CStateStorage *m_storage;
   double         m_peak;
   double         m_savedPeak;

public:
   CDrawdownManager() { m_storage = NULL; m_peak = 0.0; m_savedPeak = 0.0; }

   void Init(CStateStorage *storage, const double equity)
   {
      m_storage = storage;
      m_peak = MathMax(m_storage.LoadValue("PEAK", 0.0), equity);
      m_savedPeak = 0.0;
   }

   void Update(const double equity)
   {
      if(equity > m_peak)
         m_peak = equity;
      if(m_storage != NULL && m_peak > m_savedPeak)
      {
         m_storage.SaveValue("PEAK", m_peak);
         m_savedPeak = m_peak;
      }
   }

   double Peak() const { return m_peak; }

   double DrawdownPct(const double equity) const
   {
      return m_peak > 0.0 ? MathMax(0.0, (m_peak - equity) / m_peak * 100.0) : 0.0;
   }
};

#endif
