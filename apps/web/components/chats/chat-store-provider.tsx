'use client';

import { useEffect, useState } from 'react';

import { ChatStoreContext, createChatStore } from '@/lib/chats/store';

/** Each authenticated shell owns its cache and in-flight requests. */
export function ChatStoreProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(createChatStore);
  useEffect(
    () => () => {
      store.getState().reset();
    },
    [store],
  );
  return <ChatStoreContext.Provider value={store}>{children}</ChatStoreContext.Provider>;
}
