#ifndef TM_REQUESTBUILDER_MQH
#define TM_REQUESTBUILDER_MQH

enum ENUM_EXEC_TYPE
{
   EXEC_MODIFY_SL = 0,
   EXEC_MODIFY_TP,
   EXEC_MODIFY_LEVELS,     // SL and TP together, 0 = none (manual use)
   EXEC_CLOSE,
   EXEC_PARTIAL_CLOSE
};

string TM_ExecTypeText(const ENUM_EXEC_TYPE t)
{
   switch(t)
   {
      case EXEC_MODIFY_SL:     return "MODIFY_SL";
      case EXEC_MODIFY_TP:     return "MODIFY_TP";
      case EXEC_MODIFY_LEVELS: return "MODIFY_LEVELS";
      case EXEC_CLOSE:         return "CLOSE";
      case EXEC_PARTIAL_CLOSE: return "PARTIAL_CLOSE";
   }
   return "?";
}

// A request to change one position. `flags`, `level` and `initial` are carried
// through untouched so the caller can update its state once the request succeeds.
struct SExecRequest
{
   ENUM_EXEC_TYPE type;
   ulong          ticket;
   double         sl;
   double         tp;
   double         volume;
   int            level;      // partial level, -1 when not a partial
   int            flags;      // management flags to set on success
   bool           initial;    // sl becomes the position's initial SL on success
   bool           manual;     // typed by the user: never retried, never put on cooldown
   string         reason;

   void Reset()
   {
      type = EXEC_MODIFY_SL; ticket = 0;
      sl = 0.0; tp = 0.0; volume = 0.0;
      level = -1; flags = 0; initial = false; manual = false; reason = "";
   }
};

// A new order typed on the panel. Never produced by the automation.
struct SOrderRequest
{
   ENUM_ORDER_TYPE type;
   string          symbol;
   double          volume;
   double          price;      // pending orders only
   double          sl;         // 0 = none
   double          tp;         // 0 = none
   long            magic;
   string          comment;
};

string TM_OrderText(const ENUM_ORDER_TYPE t)
{
   switch(t)
   {
      case ORDER_TYPE_BUY:        return "BUY";
      case ORDER_TYPE_SELL:       return "SELL";
      case ORDER_TYPE_BUY_LIMIT:  return "BUY LIMIT";
      case ORDER_TYPE_BUY_STOP:   return "BUY STOP";
      case ORDER_TYPE_SELL_LIMIT: return "SELL LIMIT";
      case ORDER_TYPE_SELL_STOP:  return "SELL STOP";
   }
   return "ORDER";
}

class CRequestBuilder
{
public:
   void ModifySL(const ulong ticket, const double sl, const int flags,
                 const string reason, SExecRequest &r) const
   {
      r.Reset();
      r.type = EXEC_MODIFY_SL; r.ticket = ticket; r.sl = sl; r.flags = flags; r.reason = reason;
   }

   void ModifyTP(const ulong ticket, const double tp, const string reason, SExecRequest &r) const
   {
      r.Reset();
      r.type = EXEC_MODIFY_TP; r.ticket = ticket; r.tp = tp; r.reason = reason;
   }

   // Explicit SL and TP for a position. 0 removes a level.
   void ModifyLevels(const ulong ticket, const double sl, const double tp,
                     const string reason, SExecRequest &r) const
   {
      r.Reset();
      r.type = EXEC_MODIFY_LEVELS; r.ticket = ticket; r.sl = sl; r.tp = tp; r.reason = reason; r.manual = true;
   }

   void Close(const ulong ticket, const int level, const string reason, SExecRequest &r) const
   {
      r.Reset();
      r.type = EXEC_CLOSE; r.ticket = ticket; r.level = level; r.reason = reason;
   }

   void PartialClose(const ulong ticket, const double volume, const int level,
                     const string reason, SExecRequest &r) const
   {
      r.Reset();
      r.type = EXEC_PARTIAL_CLOSE; r.ticket = ticket; r.volume = volume; r.level = level; r.reason = reason;
   }
};

#endif
