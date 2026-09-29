#ifndef TM_TRAILINGMANAGER_MQH
#define TM_TRAILINGMANAGER_MQH

#include "../Position/PositionState.mqh"
#include "../Execution/RequestBuilder.mqh"

enum ENUM_TRAIL_MODE
{
   TRAIL_FIXED = 0,     // fixed distance behind price
   TRAIL_PERCENT        // give back a percentage of the current profit
};

struct STrailingConfig
{
   bool            enabled;
   ENUM_TRAIL_MODE mode;
   double          activationPoints;  // profit needed before trailing starts
   double          distancePoints;    // TRAIL_FIXED
   double          percent;           // TRAIL_PERCENT
   double          stepPoints;        // the stop only moves in jumps of at least this size
};

// The core only depends on this: how far behind price the stop should sit.
// An ATR-based provider can be plugged in with SetProvider() without touching the core.
class CTrailingDistance
{
public:
   virtual ~CTrailingDistance() {}
   virtual double Distance(CManagedPosition *p, const SSymbolRules &rules, const double profitDistance)
   {
      return 0.0;
   }
};

class CFixedTrailDistance : public CTrailingDistance
{
private:
   double m_points;
public:
   CFixedTrailDistance(const double points) { m_points = points; }
   virtual double Distance(CManagedPosition *p, const SSymbolRules &rules, const double profitDistance)
   {
      return m_points * rules.point;
   }
};

class CPercentTrailDistance : public CTrailingDistance
{
private:
   double m_percent;
public:
   CPercentTrailDistance(const double percent) { m_percent = percent; }
   virtual double Distance(CManagedPosition *p, const SSymbolRules &rules, const double profitDistance)
   {
      return profitDistance * m_percent / 100.0;
   }
};

class CTrailingManager
{
private:
   STrailingConfig    m_cfg;
   CTrailingDistance *m_provider;
   bool               m_ownsProvider;
   CRequestBuilder    m_builder;

   void ReleaseProvider()
   {
      if(m_ownsProvider && m_provider != NULL)
         delete m_provider;
      m_provider = NULL;
      m_ownsProvider = false;
   }

public:
   CTrailingManager() { m_provider = NULL; m_ownsProvider = false; m_cfg.enabled = false; }
   ~CTrailingManager() { ReleaseProvider(); }

   void Configure(const STrailingConfig &cfg)
   {
      m_cfg = cfg;
      ReleaseProvider();
      if(cfg.mode == TRAIL_PERCENT)
         m_provider = new CPercentTrailDistance(cfg.percent);
      else
         m_provider = new CFixedTrailDistance(cfg.distancePoints);
      m_ownsProvider = true;
   }

   void SetEnabled(const bool on) { m_cfg.enabled = on; }
   bool Enabled() const { return m_cfg.enabled; }

   // The caller keeps ownership of an external provider.
   void SetProvider(CTrailingDistance *provider)
   {
      ReleaseProvider();
      m_provider = provider;
   }

   bool Propose(CManagedPosition *p, const SSymbolRules &rules,
                const double bid, const double ask, SExecRequest &req)
   {
      if(!m_cfg.enabled || m_provider == NULL)
         return false;

      const double profit = p.ProfitDistance(bid, ask);
      if(profit <= 0.0 || profit < m_cfg.activationPoints * rules.point)
         return false;

      // Never closer to the market than the broker allows.
      double dist = m_provider.Distance(p, rules, profit);
      dist = MathMax(dist, rules.MinStopDistance() + rules.point);
      if(dist <= 0.0)
         return false;

      const double ref = rules.ClosePrice(p.IsBuy(), bid, ask);
      const double sl = rules.NormalizePrice(p.IsBuy() ? ref - dist : ref + dist);

      if(p.sl > 0.0)
      {
         const double gain = p.IsBuy() ? sl - p.sl : p.sl - sl;
         const double minGain = MathMax(m_cfg.stepPoints * rules.point, rules.tickSize);
         if(gain < minGain - rules.point * 0.1)
            return false;
      }
      if(!rules.IsValidSL(p.IsBuy(), sl, bid, ask))
         return false;

      m_builder.ModifySL(p.ticket, sl, TM_FLAG_TRAILING, "trailing", req);
      return true;
   }
};

#endif
