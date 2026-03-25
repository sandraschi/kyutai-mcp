import { Route, Routes } from "react-router-dom";
import { AppShell } from "./shell/AppShell";
import { HomePage } from "./pages/HomePage";
import { ToolsPage } from "./pages/ToolsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { HelpPage } from "./pages/HelpPage";
import { ActionsPage } from "./pages/ActionsPage";
import { StatusPage } from "./pages/StatusPage";
import { ChatPage } from "./pages/ChatPage";
import { AppsPage } from "./pages/AppsPage";
import { MoshiTalkPage } from "./pages/MoshiTalkPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LoggerPage } from "./pages/LoggerPage";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/actions" element={<ActionsPage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/moshi" element={<MoshiTalkPage />} />
        <Route path="/talk" element={<MoshiTalkPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/logs" element={<LoggerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}

