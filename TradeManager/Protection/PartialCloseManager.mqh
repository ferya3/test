#ifndef TM_PARTIALCLOSEMANAGER_MQH
#define TM_PARTIALCLOSEMANAGER_MQH

#include "../Position/PositionState.mqh"
#include "../Execution/RequestBuilder.mqh"

struct SPartialConfig
{
   bool   enabled;
   double levelR[TM_PARTIAL_LEVELS];     // profit, in R, at which the level fires (0 = level off)
   double closePct[TM_PARTIAL_LEVELS];   // percent of the INITIAL volume to close (0 = level off)
};

// Initial 1.00 lot:  1R -> close 0.50,  2R -> close 0.25,  3R -> close 0.25.
// Levels fire strictly in order, one per call.
class CPartialCloseManager
{
private:
   SPartialConfig  m_cfg;
   CRequestBuilder m_builder;

public:
   CPartialCloseManager()
   {
      m_cfg.enabled = false;
      for(int i = 0; i < TM_PARTIAL_LEVELS; i++) { m_cfg.levelR[i] = 0.0; m_cfg.closePct[i] = 0.0; }
   }

   void Configure(const SPartialConfig &cfg) { m_cfg = cfg; }
   void SetEnabled(const bool on) { m_cfg.enabled = on; }
   bool Enabled() const { return m_cfg.enabled; }

   bool Propose(CManagedPosition *p, const SSymbolRules &rules, const SVolumeRules &vol,
                const double bid, const double ask, SExecRequest &req)
   {
      if(!m_cfg.enabled || !p.HasRisk() || p.initialVolume <= 0.0)
         return false;

      const double profit = p.ProfitDistance(bid, ask);

      for(int i = 0; i < TM_PARTIAL_LEVELS; i++)
      {
         if(p.PartialDone(i))
            continue;
         if(m_cfg.levelR[i] <= 0.0 || m_cfg.closePct[i] <= 0.0)
         {
            p.MarkPartial(i);
            continue;
         }
         if(profit < m_cfg.levelR[i] * p.initialRisk)
            return false;

         double v = vol.Normalize(p.initialVolume * m_cfg.closePct[i] / 100.0);
         if(v <= 0.0)                     // share is smaller than one minimum lot
         {
            p.MarkPartial(i);
            continue;
         }

         const string why = StringFormat("partial %d at %.2fR", i + 1, m_cfg.levelR[i]);
         // A remainder below the minimum lot cannot exist, so close what is left.
         if(v >= p.volume - TM_EPS || p.volume - v < vol.minVol - TM_EPS)
            m_builder.Close(p.ticket, i, why, req);
         else
            m_builder.PartialClose(p.ticket, v, i, why, req);
         return true;
      }
      return false;
   }
};

#endif
