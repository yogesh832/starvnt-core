import React, { createContext, useContext, useState } from "react";

const Context = createContext({
  prompt: "",
  setPrompt: (_value: string) => {},
});
export function PlanningIntentProvider({ children }: React.PropsWithChildren) {
  const [prompt, setPrompt] = useState("");
  return (
    <Context.Provider value={{ prompt, setPrompt }}>
      {children}
    </Context.Provider>
  );
}
export const usePlanningIntent = () => useContext(Context);
