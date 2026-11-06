import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { APIProvider } from "@vis.gl/react-google-maps";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import BackendStatusBanner from "@/components/BackendStatusBanner";

import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

import Chat from "./components/Chat";
import { useAppStore } from "./store/useAppStore";
import { connectAuthenticatedSocket, disconnectSocket } from "./socket";

const queryClient = new QueryClient();

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

const ChatRoute = () => {
  const user = useAppStore((s) => s.user);
  const id = user.userId ?? 0;
  return <Chat user={{ id }} />;
};

const App = () => {
  const userId = useAppStore((state) => state.user.userId);
  const currentPage = useAppStore((state) => state.currentPage);
  useEffect(() => {
    if (userId) connectAuthenticatedSocket();
    else disconnectSocket();
  }, [userId]);

  return (
    <QueryClientProvider client={queryClient}>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['marker']}>
        <TooltipProvider>
          {currentPage !== 'onboarding' && currentPage !== 'onboarding-slides' && <BackendStatusBanner />}
          <Toaster />
          <Sonner />

          <BrowserRouter>
            <Routes>

              {/* HOME PAGE */}
              <Route path="/" element={<Index />} />

              {/* CHAT PAGE */}
              <Route path="/chat" element={<ChatRoute />} />

              {/* 404 PAGE */}
              <Route path="*" element={<NotFound />} />

            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </APIProvider>
    </QueryClientProvider>
  );
};

export default App;
