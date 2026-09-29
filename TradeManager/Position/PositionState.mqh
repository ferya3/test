#ifndef TM_POSITIONSTATE_MQH
#define TM_POSITIONSTATE_MQH

#include "../Broker/BrokerAdapter.mqh"
#include "../Utils/MathUtils.mqh"

// Independent management flags: several can be active at once.
#define TM_FLAG_BE        0x01
#define TM_FLAG_TRAILING  0x02

#define TM_PARTIAL_LEVELS 3

// Informational summary derived from the flags; never used to gate logic.
enum ENUM_POS_STATE
{
   POS_OPEN = 0,      // no stop loss yet
   POS_PROTECTED,     // stop loss in place
   POS_BE_DONE,       // break-even executed
   POS_PARTIAL,       // at least one partial close executed
   POS_TRAILING,      // trailing started
   POS_CLOSED
};

string TM_StateText(const ENUM_POS_STATE s)
{
   switch(s)
   {
      case POS_OPEN:      return "OPEN";
      case POS_PROTECTED: return "PROTECTED";
      case POS_BE_DONE:   return "BE";
      case POS_PARTIAL:   return "PARTIAL";
      case POS_TRAILING:  return "TRAILING";
      case POS_CLOSED:    return "CLOSED";
   }
   return "?";
}

// True when `candidate` protects more than `current` for this direction.
bool TM_IsBetterSL(const bool isBuy, const double candidate, const double current)
{
   return isBuy ? (candidate > current) : (candidate < current);
}

// One managed position: the live MT5 fields plus everything the manager has to remember.
class CManagedPosition
{
public:
   // live
   ulong               ticket;
   string              symbol;
   ENUM_POSITION_TYPE  type;
   double              volume;
   double              entry;
   double              sl;
   double              tp;
   double              price;
   double              profit;
   long                magic;
   string              comment;
   datetime            openTime;

   // management
   double              initialSL;
   double              initialRisk;     // price distance |entry - initialSL|
   double              initialVolume;
   int                 flags;
   int                 partialMask;     // bit n set = partial level n done
   ENUM_POS_STATE      state;
   bool                dirty;           // needs persisting
   bool                seen;            // scratch flag used by the synchronizer

   CManagedPosition()
   {
      ticket = 0; symbol = ""; type = POSITION_TYPE_BUY;
      volume = 0.0; entry = 0.0; sl = 0.0; tp = 0.0; price = 0.0; profit = 0.0;
      magic = 0; comment = ""; openTime = 0;
      initialSL = 0.0; initialRisk = 0.0; initialVolume = 0.0;
      flags = 0; partialMask = 0; state = POS_OPEN; dirty = false; seen = false;
   }

   bool IsBuy() const { return type == POSITION_TYPE_BUY; }
   bool HasRisk() const { return initialRisk > 0.0; }
   bool HasFlag(const int f) const { return (flags & f) == f; }
   bool PartialDone(const int level) const { return (partialMask & (1 << level)) != 0; }

   void SetFlag(const int f)
   {
      if(f != 0 && (flags & f) != f)
      {
         flags |= f;
         dirty = true;
      }
   }

   void MarkPartial(const int level)
   {
      if(level >= 0 && !PartialDone(level))
      {
         partialMask |= (1 << level);
         dirty = true;
      }
   }

   // True when the stop sits on the losing side of the entry.
   bool IsRiskSideSL(const double stop) const
   {
      return IsBuy() ? (stop < entry) : (stop > entry);
   }

   void SetInitialSL(const double stop)
   {
      initialSL   = stop;
      initialRisk = MathAbs(entry - stop);
      dirty       = true;
   }

   void ApplySnapshot(const SPositionSnapshot &s)
   {
      ticket   = s.ticket;
      symbol   = s.symbol;
      type     = s.type;
      volume   = s.volume;
      entry    = s.entry;
      sl       = s.sl;
      tp       = s.tp;
      price    = s.price;
      profit   = s.profit;
      magic    = s.magic;
      comment  = s.comment;
      openTime = s.openTime;

      if(volume > initialVolume + TM_EPS)
      {
         initialVolume = volume;
         dirty = true;
      }
      // A stop set by hand on the risk side becomes the reference risk.
      if(initialSL <= 0.0 && sl > 0.0 && IsRiskSideSL(sl))
         SetInitialSL(sl);
      ResolveState();
   }

   // How far the market has moved in favour of the position, in price units.
   double ProfitDistance(const double bid, const double ask) const
   {
      return IsBuy() ? (bid - entry) : (entry - ask);
   }

   void ResolveState()
   {
      if(HasFlag(TM_FLAG_TRAILING))      state = POS_TRAILING;
      else if(partialMask != 0)          state = POS_PARTIAL;
      else if(HasFlag(TM_FLAG_BE))       state = POS_BE_DONE;
      else if(sl > 0.0)                  state = POS_PROTECTED;
      else                               state = POS_OPEN;
   }
};

#endif
