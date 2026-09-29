#ifndef TM_SESSIONCLOCK_MQH
#define TM_SESSIONCLOCK_MQH

#define TM_SESSIONS 4

// Forex market sessions in UTC hours. Start > end means the session wraps past midnight.
// Daylight saving is not automatic: adjust the hours in the inputs when clocks change.
class CSessionClock
{
private:
   string m_short[TM_SESSIONS];
   int    m_start[TM_SESSIONS];
   int    m_end[TM_SESSIONS];
   bool   m_open[TM_SESSIONS];
   string m_text[TM_SESSIONS];
   bool   m_weekend;
   string m_clock;

   string Span(const int minutes) const
   {
      return StringFormat("%dh%02dm", minutes / 60, minutes % 60);
   }

public:
   CSessionClock()
   {
      m_short[0] = "SYD"; m_short[1] = "TKY"; m_short[2] = "LON"; m_short[3] = "NYC";
      Configure(22, 7, 0, 9, 8, 17, 13, 22);
      m_weekend = false;
      m_clock = "";
      for(int i = 0; i < TM_SESSIONS; i++) { m_open[i] = false; m_text[i] = ""; }
   }

   void Configure(const int sydS, const int sydE, const int tkyS, const int tkyE,
                  const int lonS, const int lonE, const int nycS, const int nycE)
   {
      m_start[0] = sydS; m_end[0] = sydE;
      m_start[1] = tkyS; m_end[1] = tkyE;
      m_start[2] = lonS; m_end[2] = lonE;
      m_start[3] = nycS; m_end[3] = nycE;
   }

   void Update()
   {
      const datetime gmt = TimeGMT();
      MqlDateTime dt;
      TimeToStruct(gmt, dt);
      const int now = dt.hour * 60 + dt.min;

      // Forex is closed from Friday 22:00 UTC to Sunday 22:00 UTC.
      m_weekend = (dt.day_of_week == 6) ||
                  (dt.day_of_week == 5 && now >= 22 * 60) ||
                  (dt.day_of_week == 0 && now < 22 * 60);

      for(int i = 0; i < TM_SESSIONS; i++)
      {
         const int s = m_start[i] * 60;
         const int e = m_end[i] * 60;
         const bool wraps = (e <= s);
         m_open[i] = !m_weekend && (wraps ? (now >= s || now < e) : (now >= s && now < e));

         if(m_weekend)
            m_text[i] = m_short[i] + " off";
         else if(m_open[i])
            m_text[i] = m_short[i] + " ON  " + Span((e - now + 1440) % 1440);
         else
            m_text[i] = m_short[i] + " off +" + Span((s - now + 1440) % 1440);
      }

      MqlDateTime sv;
      TimeToStruct(TimeCurrent(), sv);
      m_clock = StringFormat("UTC %02d:%02d   Server %02d:%02d%s", dt.hour, dt.min, sv.hour, sv.min,
                             m_weekend ? "   MARKET CLOSED (weekend)" : "");
   }

   bool   Weekend() const { return m_weekend; }
   string Clock() const { return m_clock; }
   string Text(const int i) const { return m_text[i]; }
   bool   IsOpen(const int i) const { return m_open[i]; }
};

#endif
