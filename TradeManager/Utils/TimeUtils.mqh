#ifndef TM_TIMEUTILS_MQH
#define TM_TIMEUTILS_MQH

// Midnight of the given server time.
datetime TM_DayStart(const datetime t)
{
   const long v = (long)t;
   return (datetime)(v - (v % 86400));
}

ulong TM_NowMs()
{
   return GetTickCount64();
}

#endif
