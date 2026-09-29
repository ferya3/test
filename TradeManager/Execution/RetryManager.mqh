#ifndef TM_RETRYMANAGER_MQH
#define TM_RETRYMANAGER_MQH

#include "RequestBuilder.mqh"
#include "../Utils/TimeUtils.mqh"

// A queued retry, or a cooldown that keeps an identical request from being sent again.
struct SRetryEntry
{
   SExecRequest req;
   int          attempts;
   ulong        dueMs;
   bool         cooldown;
};

// Pure queue: it holds requests and says when they are due. The ExecutionEngine sends them.
class CRetryManager
{
private:
   SRetryEntry m_q[];
   int         m_n;

   int IndexOf(const ulong ticket, const ENUM_EXEC_TYPE type) const
   {
      for(int i = 0; i < m_n; i++)
         if(m_q[i].req.ticket == ticket && m_q[i].req.type == type)
            return i;
      return -1;
   }

   void RemoveAt(const int index)
   {
      for(int i = index; i < m_n - 1; i++)
         m_q[i] = m_q[i + 1];
      m_n--;
      ArrayResize(m_q, m_n);
   }

   void Put(const SRetryEntry &e)
   {
      const int idx = IndexOf(e.req.ticket, e.req.type);
      if(idx >= 0)
      {
         m_q[idx] = e;
         return;
      }
      ArrayResize(m_q, m_n + 1);
      m_q[m_n++] = e;
   }

public:
   CRetryManager() { m_n = 0; }

   // True while a retry is pending or a cooldown has not yet expired.
   bool IsBlocked(const ulong ticket, const ENUM_EXEC_TYPE type) const
   {
      const int idx = IndexOf(ticket, type);
      if(idx < 0)
         return false;
      if(m_q[idx].cooldown && TM_NowMs() >= m_q[idx].dueMs)
         return false;
      return true;
   }

   void Schedule(const SExecRequest &req, const int attempts, const ulong delayMs)
   {
      SRetryEntry e;
      e.req = req; e.attempts = attempts; e.dueMs = TM_NowMs() + delayMs; e.cooldown = false;
      Put(e);
   }

   void Cooldown(const SExecRequest &req, const ulong ms)
   {
      SRetryEntry e;
      e.req = req; e.attempts = 0; e.dueMs = TM_NowMs() + ms; e.cooldown = true;
      Put(e);
   }

   void Clear(const ulong ticket, const ENUM_EXEC_TYPE type)
   {
      const int idx = IndexOf(ticket, type);
      if(idx >= 0)
         RemoveAt(idx);
   }

   // Removes and returns the first retry that is due.
   bool PopDue(SRetryEntry &out)
   {
      const ulong now = TM_NowMs();
      for(int i = 0; i < m_n; i++)
      {
         if(!m_q[i].cooldown && now >= m_q[i].dueMs)
         {
            out = m_q[i];
            RemoveAt(i);
            return true;
         }
      }
      return false;
   }

   void Prune()
   {
      const ulong now = TM_NowMs();
      for(int i = m_n - 1; i >= 0; i--)
         if(m_q[i].cooldown && now >= m_q[i].dueMs)
            RemoveAt(i);
   }

   int Pending() const { return m_n; }
};

#endif
