#ifndef TM_MATHUTILS_MQH
#define TM_MATHUTILS_MQH

#define TM_EPS 1e-9

bool TM_IsZero(const double v)
{
   return MathAbs(v) < TM_EPS;
}

// Number of decimals needed to represent a step such as 0.01 or 0.5.
int TM_StepDigits(const double step)
{
   int d = 0;
   double s = step;
   while(d < 8 && MathAbs(s - MathRound(s)) > 1e-7)
   {
      s *= 10.0;
      d++;
   }
   return d;
}

double TM_FloorToStep(const double value, const double step)
{
   if(step <= 0.0)
      return value;
   return NormalizeDouble(MathFloor(value / step + 1e-7) * step, TM_StepDigits(step));
}

#endif
