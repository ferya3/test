#ifndef TM_RISKGUARD_MQH
#define TM_RISKGUARD_MQH

#include "RiskCalculator.mqh"
#include "../Broker/BrokerAdapter.mqh"
#include "../Position/PositionState.mqh"
#include "../Utils/TimeUtils.mqh"

enum ENUM_PROTECTION
{
   PROT_NONE = 0,
   PROT_DAILY_LOSS,
   PROT_DRAWDOWN,
   PROT_EQUITY,
   PROT_MARGIN
};

string TM_ProtectionText(const ENUM_PROTECTION p)
{
   switch(p)
   {
      case PROT_NONE:       return "OK";
      case PROT_DAILY_LOSS: return "DAILY LOSS LIMIT";
      case PROT_DRAWDOWN:   return "MAX DRAWDOWN";
      case PROT_EQUITY:     return "MIN EQUITY";
      case PROT_MARGIN:     return "MARGIN LEVEL";
   }
   return "?";
}

struct SRiskLimits
{
   double maxDailyLossPct;   // 0 = off
   double maxDrawdownPct;    // 0 = off
   double minEquity;         // 0 = off
   double minMarginLevel;    // 0 = off
};

// Gatekeeper between "protection wants X" and "execution does X".
// It only ever allows actions that reduce risk or take profit, and it raises the
// account-level protection state. It never opens anything.
class CRiskGuard
{
private:
   CBrokerAdapter  *m_broker;
   SRiskLimits      m_limits;
   ENUM_PROTECTION  m_state;
   datetime         m_latchDay;

public:
   CRiskGuard()
   {
      m_broker = NULL; m_state = PROT_NONE; m_latchDay = 0;
      m_limits.maxDailyLossPct = 0.0; m_limits.maxDrawdownPct = 0.0;
      m_limits.minEquity = 0.0; m_limits.minMarginLevel = 0.0;
   }

   void Attach(CBrokerAdapter *broker) { m_broker = broker; }
   void Configure(const SRiskLimits &limits) { m_limits = limits; }

   ENUM_PROTECTION Status() const { return m_state; }
   bool IsProtectionActive() const { return m_state != PROT_NONE; }

   // Returns true only on the transition into a protection state.
   // A daily-loss trip stays latched until the next server day.
   bool Evaluate(const SAccountRisk &acc, const double drawdownPct)
   {
      const datetime today = TM_DayStart(TimeCurrent());
      ENUM_PROTECTION now = PROT_NONE;

      if(m_state == PROT_DAILY_LOSS && m_latchDay == today)
         now = PROT_DAILY_LOSS;
      else if(m_limits.maxDailyLossPct > 0.0 && acc.dailyPLPct <= -m_limits.maxDailyLossPct)
         now = PROT_DAILY_LOSS;
      else if(m_limits.maxDrawdownPct > 0.0 && drawdownPct >= m_limits.maxDrawdownPct)
         now = PROT_DRAWDOWN;
      else if(m_limits.minEquity > 0.0 && acc.equity <= m_limits.minEquity)
         now = PROT_EQUITY;
      else if(m_limits.minMarginLevel > 0.0 && acc.marginLevel > 0.0 && acc.marginLevel <= m_limits.minMarginLevel)
         now = PROT_MARGIN;

      if(now == PROT_DAILY_LOSS)
         m_latchDay = today;

      const bool tripped = (m_state == PROT_NONE && now != PROT_NONE);
      m_state = now;
      return tripped;
   }

   bool CanAct(string &why) const
   {
      if(!m_broker.IsTradeAllowed())
      {
         why = "trading not allowed (terminal, account or algo trading)";
         return false;
      }
      return true;
   }

   // New orders are refused while an account-level protection is active.
   bool CanOpen(string &why) const
   {
      if(!CanAct(why))
         return false;
      if(m_state != PROT_NONE)
      {
         why = "protection active: " + TM_ProtectionText(m_state);
         return false;
      }
      return true;
   }

   // A stop may only move towards safety; it can never be widened or removed.
   bool CanModify(CManagedPosition *p, const double newSL, string &why) const
   {
      if(!CanAct(why))
         return false;
      if(newSL <= 0.0)
      {
         why = "refusing to remove a stop loss";
         return false;
      }
      if(p.sl > 0.0 && !TM_IsBetterSL(p.IsBuy(), newSL, p.sl))
      {
         why = "new stop loss would not reduce risk";
         return false;
      }
      return true;
   }

   bool CanClose(CManagedPosition *p, string &why) const
   {
      return CanAct(why);
   }

   bool CanPartialClose(CManagedPosition *p, const double volume, string &why) const
   {
      if(!CanAct(why))
         return false;
      if(volume <= 0.0 || volume >= p.volume - TM_EPS)
      {
         why = "partial volume must be smaller than the position";
         return false;
      }
      return true;
   }
};

#endif
