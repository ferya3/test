#ifndef TM_RISKENGINE_MQH
#define TM_RISKENGINE_MQH

#include "RiskCalculator.mqh"
#include "DrawdownManager.mqh"
#include "../Position/PositionRegistry.mqh"
#include "../Utils/TimeUtils.mqh"

// Measures the account and the managed positions. It computes; it never acts.
class CRiskEngine
{
private:
   CBrokerAdapter    *m_broker;
   CPositionRegistry *m_registry;
   CRiskCalculator    m_calc;
   CDrawdownManager   m_drawdown;
   double             m_realizedToday;

public:
   SAccountRisk account;
   SExposure    exposure;
   double       drawdownPct;

   CRiskEngine()
   {
      m_broker = NULL; m_registry = NULL; m_realizedToday = 0.0; drawdownPct = 0.0;
      ZeroMemory(account);
      ZeroMemory(exposure);
   }

   void Attach(CBrokerAdapter *broker, CPositionRegistry *registry, CStateStorage *storage)
   {
      m_broker = broker;
      m_registry = registry;
      m_drawdown.Init(storage, broker.Equity());
      Refresh(true);
   }

   double DrawdownPeak() const { return m_drawdown.Peak(); }

   // withHistory re-reads today's deals; it is cheap but not free, so it runs on
   // the timer and on deal events rather than on every tick.
   void Refresh(const bool withHistory)
   {
      if(withHistory)
      {
         const datetime now = TimeCurrent();
         m_realizedToday = m_broker.RealizedResult(TM_DayStart(now), now + 60);
      }

      account.balance     = m_broker.Balance();
      account.equity      = m_broker.Equity();
      account.freeMargin  = m_broker.FreeMargin();
      account.marginLevel = m_broker.MarginLevel();
      account.floating    = m_broker.Floating();
      account.dailyPL     = m_realizedToday + account.floating;
      account.dayStartBalance = account.balance - m_realizedToday;
      account.dailyPLPct  = account.dayStartBalance > 0.0 ? account.dailyPL / account.dayStartBalance * 100.0 : 0.0;

      m_drawdown.Update(account.equity);
      drawdownPct = m_drawdown.DrawdownPct(account.equity);

      exposure.positions = 0;
      exposure.unprotected = 0;
      exposure.totalVolume = 0.0;
      exposure.openRiskMoney = 0.0;
      for(int i = 0; i < m_registry.Count(); i++)
      {
         CManagedPosition *p = m_registry.At(i);
         exposure.positions++;
         exposure.totalVolume += p.volume;
         if(p.sl <= 0.0)
         {
            exposure.unprotected++;
            continue;
         }
         SSymbolRules rules;
         if(rules.Load(p.symbol))
            exposure.openRiskMoney += m_calc.OpenRiskMoney(p, rules);
      }
      exposure.openRiskPct = m_calc.Percent(exposure.openRiskMoney, account.balance);
   }
};

#endif
