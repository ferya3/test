#ifndef TM_RISKCALCULATOR_MQH
#define TM_RISKCALCULATOR_MQH

#include "../Position/PositionState.mqh"

struct SAccountRisk
{
   double balance;
   double equity;
   double freeMargin;
   double marginLevel;      // 0 when no margin is in use
   double floating;
   double dailyPL;          // realized today + floating
   double dailyPLPct;       // of the balance at the start of the day
   double dayStartBalance;
};

struct SExposure
{
   int    positions;
   int    unprotected;      // managed positions without a stop loss
   double totalVolume;
   double openRiskMoney;    // what is lost if every current stop is hit
   double openRiskPct;
};

class CRiskCalculator
{
public:
   double MoneyForDistance(const SSymbolRules &rules, const double distance, const double volume) const
   {
      if(rules.tickSize <= 0.0)
         return 0.0;
      return distance / rules.tickSize * rules.tickValue * volume;
   }

   // Money at risk right now: distance from entry to the current stop, if it is still on the losing side.
   double OpenRiskMoney(CManagedPosition *p, const SSymbolRules &rules) const
   {
      if(p.sl <= 0.0 || !p.IsRiskSideSL(p.sl))
         return 0.0;
      return MoneyForDistance(rules, MathAbs(p.entry - p.sl), p.volume);
   }

   // Money the trade was risking when it started: 1R.
   double InitialRiskMoney(CManagedPosition *p, const SSymbolRules &rules) const
   {
      return MoneyForDistance(rules, p.initialRisk, p.initialVolume);
   }

   double Percent(const double money, const double balance) const
   {
      return balance > 0.0 ? money / balance * 100.0 : 0.0;
   }
};

#endif
