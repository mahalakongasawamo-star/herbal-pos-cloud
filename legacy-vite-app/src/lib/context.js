import React, { useContext } from 'react';

export const AppCtx = React.createContext(null);
export const useApp = () => useContext(AppCtx);
