#ifndef TM_VOLUMERULES_MQH
#define TM_VOLUMERULES_MQH

#include "../Utils/MathUtils.mqh"

struct SVolumeRules
{
   double minVol;
   double maxVol;
   double step;

   bool Load(const string sym)
   {
      minVol = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
      maxVol = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
      step   = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
      return(minVol > 0.0 && maxVol >= minVol && step > 0.0);
   }

   // Rounds down to the volume step and caps at the maximum.
   // Returns 0 when the result would be below the minimum volume.
   double Normalize(const double volume) const
   {
      double v = MathMin(volume, maxVol);
      v = TM_FloorToStep(v, step);
      if(v < minVol - TM_EPS)
         return 0.0;
      return v;
   }
};

#endif
