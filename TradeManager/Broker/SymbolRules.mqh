#ifndef TM_SYMBOLRULES_MQH
#define TM_SYMBOLRULES_MQH

// Per-symbol price rules: digits, tick size, stop and freeze levels.
// For an open position MT5 checks SL/TP against the closing side:
// Bid for BUY, Ask for SELL.
struct SSymbolRules
{
   string symbol;
   int    digits;
   double point;
   double tickSize;
   double tickValue;
   double stopsPoints;
   double freezePoints;

   bool Load(const string sym)
   {
      symbol       = sym;
      digits       = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      point        = SymbolInfoDouble(sym, SYMBOL_POINT);
      tickSize     = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
      tickValue    = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE_LOSS);
      if(tickValue <= 0.0)
         tickValue = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
      stopsPoints  = (double)SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL);
      freezePoints = (double)SymbolInfoInteger(sym, SYMBOL_TRADE_FREEZE_LEVEL);
      return(point > 0.0 && tickSize > 0.0 && tickValue > 0.0);
   }

   double NormalizePrice(const double price) const
   {
      return NormalizeDouble(MathRound(price / tickSize) * tickSize, digits);
   }

   double MinStopDistance() const { return stopsPoints * point; }
   double FreezeDistance() const  { return freezePoints * point; }

   double ClosePrice(const bool isBuy, const double bid, const double ask) const
   {
      return isBuy ? bid : ask;
   }

   bool IsValidSL(const bool isBuy, const double sl, const double bid, const double ask) const
   {
      if(sl <= 0.0)
         return false;
      const double ref = ClosePrice(isBuy, bid, ask);
      const double dist = isBuy ? (ref - sl) : (sl - ref);
      return(dist >= MinStopDistance() - point * 0.5);
   }

   bool IsValidTP(const bool isBuy, const double tp, const double bid, const double ask) const
   {
      if(tp <= 0.0)
         return false;
      const double ref = ClosePrice(isBuy, bid, ask);
      const double dist = isBuy ? (tp - ref) : (ref - tp);
      return(dist >= MinStopDistance() - point * 0.5);
   }

   // MT5 refuses to modify a position whose SL or TP is within the freeze level of the market.
   bool IsFrozen(const bool isBuy, const double curSL, const double curTP,
                 const double bid, const double ask) const
   {
      if(freezePoints <= 0.0)
         return false;
      const double ref = ClosePrice(isBuy, bid, ask);
      const double fz  = FreezeDistance();
      if(curSL > 0.0 && MathAbs(ref - curSL) <= fz)
         return true;
      if(curTP > 0.0 && MathAbs(curTP - ref) <= fz)
         return true;
      return false;
   }
};

#endif
