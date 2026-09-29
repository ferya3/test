#ifndef TM_LIFECYCLE_MQH
#define TM_LIFECYCLE_MQH

#include "Config.mqh"

// Start-up checks and timer handling. No trading logic.
class CLifecycle
{
public:
   bool ValidateInputs(string &why) const
   {
      if(InpBEEnabled)
      {
         if(InpBETriggerR <= 0.0)          { why = "BE trigger must be > 0";         return false; }
         if(InpBEOffsetR < 0.0)            { why = "BE offset must be >= 0";         return false; }
         if(InpBEOffsetR >= InpBETriggerR) { why = "BE offset must be below trigger"; return false; }
      }
      if(InpTrailEnabled)
      {
         if(InpTrailActivation < 0 || InpTrailStep < 0) { why = "trailing activation/step must be >= 0"; return false; }
         if(InpTrailMode == TRAIL_FIXED && InpTrailDistance <= 0)
            { why = "trailing distance must be > 0"; return false; }
         if(InpTrailMode == TRAIL_PERCENT && (InpTrailPercent <= 0.0 || InpTrailPercent >= 100.0))
            { why = "trailing percent must be between 0 and 100"; return false; }
      }
      if(InpPartialEnabled)
      {
         const double total = InpPartial1Pct + InpPartial2Pct + InpPartial3Pct;
         if(InpPartial1Pct < 0.0 || InpPartial2Pct < 0.0 || InpPartial3Pct < 0.0 || total > 100.0)
            { why = "partial percentages must be >= 0 and sum to at most 100"; return false; }
         if(InpPartial1R < 0.0 || InpPartial2R < 0.0 || InpPartial3R < 0.0)
            { why = "partial levels must be >= 0"; return false; }
      }
      if(InpDefaultSLPoints < 0 || InpMaxRetries < 0 || InpRetryDelayMs < 0 || InpCooldownMs < 0)
         { why = "negative value in stop loss / execution settings"; return false; }
      return true;
   }

   bool StartTimer(const int ms) const
   {
      return EventSetMillisecondTimer(MathMax(ms, 100));
   }

   void StopTimer() const
   {
      EventKillTimer();
   }
};

#endif
