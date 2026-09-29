#ifndef TM_CONFIG_MQH
#define TM_CONFIG_MQH

#include "../Utils/Logger.mqh"
#include "../Protection/TrailingManager.mqh"
#include "../Position/PositionState.mqh"

input group "Scope"
input long   InpMagicFilter        = -1;      // Magic number to manage (-1 = all, 0 = manual trades)
input bool   InpChartSymbolOnly    = false;   // Manage only the chart's symbol

input group "Initial stop loss"
input int    InpDefaultSLPoints    = 0;       // SL (points) for positions without one (0 = off)

input group "Break-even"
input bool   InpBEEnabled          = true;    // Enable break-even
input double InpBETriggerR         = 1.0;     // Trigger, in R
input double InpBEOffsetR          = 0.1;     // Locked profit, in R

input group "Trailing"
input bool            InpTrailEnabled    = false;        // Enable trailing
input ENUM_TRAIL_MODE InpTrailMode       = TRAIL_FIXED;  // Distance mode
input int             InpTrailActivation = 200;          // Activation profit (points)
input int             InpTrailDistance   = 100;          // Fixed distance (points)
input double          InpTrailPercent    = 30.0;         // Percent of profit given back
input int             InpTrailStep       = 20;           // Minimum step (points)

input group "Partial close (percent of initial volume)"
input bool   InpPartialEnabled     = false;   // Enable partial closes
input double InpPartial1R          = 1.0;     // Level 1 at (R)
input double InpPartial1Pct        = 50.0;    // Level 1 close (%)
input double InpPartial2R          = 2.0;     // Level 2 at (R)
input double InpPartial2Pct        = 25.0;    // Level 2 close (%)
input double InpPartial3R          = 3.0;     // Level 3 at (R)
input double InpPartial3Pct        = 25.0;    // Level 3 close (%)

input group "Risk guard (0 = off)"
input double InpMaxDailyLossPct    = 0.0;     // Max daily loss (% of day-start balance)
input double InpMaxDrawdownPct     = 0.0;     // Max drawdown from equity peak (%)
input double InpMinEquity          = 0.0;     // Minimum equity
input double InpMinMarginLevel     = 0.0;     // Minimum margin level (%)
input bool   InpCloseAllOnTrip     = false;   // Close all managed positions when a limit trips

input group "Execution"
input int    InpDeviationPoints    = 20;      // Max deviation (points)
input int    InpMaxRetries         = 3;       // Retries after a transient failure
input int    InpRetryDelayMs       = 500;     // Delay before a retry (ms)
input int    InpCooldownMs         = 3000;    // Pause after a failed or refused request (ms)

input group "Order entry (panel buttons)"
input double InpDefaultLot         = 0.01;    // Default lot shown in the panel
input double InpMaxOrderLot        = 0.0;     // Refuse panel orders above this lot (0 = no cap)

input group "Sessions (UTC hours, 0-23; adjust for daylight saving)"
input int    InpSydneyStart        = 22;      // Sydney opens
input int    InpSydneyEnd          = 7;       // Sydney closes
input int    InpTokyoStart         = 0;       // Tokyo opens
input int    InpTokyoEnd           = 9;       // Tokyo closes
input int    InpLondonStart        = 8;       // London opens
input int    InpLondonEnd          = 17;      // London closes
input int    InpNewYorkStart       = 13;      // New York opens
input int    InpNewYorkEnd         = 22;      // New York closes

input group "Runtime"
input int    InpTimerMs            = 1000;    // Timer interval (ms)
input int    InpMinProcessMs       = 100;     // Minimum time between protection passes (ms)
input bool   InpKeepPanelOnTop    = true;    // Keep the panel above trade arrows drawn on the chart
input bool   InpShowPanel          = true;    // Show the control panel on the chart
input int    InpPanelX             = 10;      // Panel X (pixels from left)
input int    InpPanelY             = 20;      // Panel Y (pixels from top)
input ENUM_TM_LOG_LEVEL InpLogLevel = TMLOG_INFO;  // Log level

#endif
