#ifndef TM_POSITIONREGISTRY_MQH
#define TM_POSITIONREGISTRY_MQH

#include "PositionState.mqh"

// Owns every managed position, keyed by ticket.
class CPositionRegistry
{
private:
   CManagedPosition *m_items[];
   int               m_count;

public:
   CPositionRegistry() { m_count = 0; }
   ~CPositionRegistry() { Clear(); }

   int Count() const { return m_count; }

   CManagedPosition *At(const int index)
   {
      if(index < 0 || index >= m_count)
         return NULL;
      return m_items[index];
   }

   CManagedPosition *Find(const ulong ticket)
   {
      for(int i = 0; i < m_count; i++)
         if(m_items[i].ticket == ticket)
            return m_items[i];
      return NULL;
   }

   CManagedPosition *Add(const SPositionSnapshot &s)
   {
      CManagedPosition *p = new CManagedPosition();
      if(p == NULL)
         return NULL;
      p.ticket = s.ticket;
      ArrayResize(m_items, m_count + 1);
      m_items[m_count++] = p;
      return p;
   }

   void RemoveAt(const int index)
   {
      if(index < 0 || index >= m_count)
         return;
      delete m_items[index];
      for(int i = index; i < m_count - 1; i++)
         m_items[i] = m_items[i + 1];
      m_count--;
      ArrayResize(m_items, m_count);
   }

   void Clear()
   {
      for(int i = 0; i < m_count; i++)
         delete m_items[i];
      m_count = 0;
      ArrayResize(m_items, 0);
   }
};

#endif
