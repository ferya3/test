#ifndef TM_ERRORHANDLER_MQH
#define TM_ERRORHANDLER_MQH

enum ENUM_ERR_ACTION
{
   ERR_SUCCESS = 0,
   ERR_NO_RETRY,        // the request itself is wrong; do not resend it
   ERR_RETRY_NOW,       // transient; try again after a short delay
   ERR_RETRY_LATER,     // blocked by market state; try again after a long delay
   ERR_REFRESH_STATE    // our picture of the position is stale; resynchronize
};

class CErrorHandler
{
public:
   ENUM_ERR_ACTION Classify(const uint retcode, const int lastError) const
   {
      switch(retcode)
      {
         case TRADE_RETCODE_DONE:
         case TRADE_RETCODE_DONE_PARTIAL:
         case TRADE_RETCODE_PLACED:
         case TRADE_RETCODE_NO_CHANGES:
            return ERR_SUCCESS;

         case TRADE_RETCODE_REQUOTE:
         case TRADE_RETCODE_PRICE_CHANGED:
         case TRADE_RETCODE_PRICE_OFF:
         case TRADE_RETCODE_REJECT:
         case TRADE_RETCODE_TIMEOUT:
         case TRADE_RETCODE_CONNECTION:
         case TRADE_RETCODE_TOO_MANY_REQUESTS:
         case TRADE_RETCODE_LOCKED:
         case TRADE_RETCODE_ERROR:
            return ERR_RETRY_NOW;

         case TRADE_RETCODE_MARKET_CLOSED:
         case TRADE_RETCODE_FROZEN:
         case TRADE_RETCODE_SERVER_DISABLES_AT:
         case TRADE_RETCODE_CLIENT_DISABLES_AT:
         case TRADE_RETCODE_TRADE_DISABLED:
            return ERR_RETRY_LATER;

         case TRADE_RETCODE_POSITION_CLOSED:
            return ERR_REFRESH_STATE;

         case TRADE_RETCODE_INVALID_STOPS:
         case TRADE_RETCODE_INVALID_VOLUME:
         case TRADE_RETCODE_INVALID_PRICE:
         case TRADE_RETCODE_INVALID:
         case TRADE_RETCODE_INVALID_FILL:
         case TRADE_RETCODE_NO_MONEY:
            return ERR_NO_RETRY;
      }

      // No retcode at all: the request never reached the server.
      if(retcode == 0)
         return ERR_RETRY_LATER;

      return ERR_NO_RETRY;
   }

   string Describe(const uint retcode) const
   {
      switch(retcode)
      {
         case TRADE_RETCODE_DONE:               return "done";
         case TRADE_RETCODE_DONE_PARTIAL:       return "done partially";
         case TRADE_RETCODE_NO_CHANGES:         return "no changes";
         case TRADE_RETCODE_REQUOTE:            return "requote";
         case TRADE_RETCODE_REJECT:             return "rejected";
         case TRADE_RETCODE_INVALID_STOPS:      return "invalid stops";
         case TRADE_RETCODE_INVALID_VOLUME:     return "invalid volume";
         case TRADE_RETCODE_INVALID_PRICE:      return "invalid price";
         case TRADE_RETCODE_TRADE_DISABLED:     return "trading disabled";
         case TRADE_RETCODE_MARKET_CLOSED:      return "market closed";
         case TRADE_RETCODE_NO_MONEY:           return "not enough money";
         case TRADE_RETCODE_TOO_MANY_REQUESTS:  return "too many requests";
         case TRADE_RETCODE_FROZEN:             return "frozen";
         case TRADE_RETCODE_CONNECTION:         return "no connection";
         case TRADE_RETCODE_POSITION_CLOSED:    return "position closed";
      }
      return StringFormat("retcode %u", retcode);
   }
};

#endif
