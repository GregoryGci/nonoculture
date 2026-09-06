import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Join } from "./pages/Join";
import { Room } from "./pages/Room";
import { HostScreen } from "./pages/HostScreen";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/room/:code" element={<Room />} />
        <Route path="/room/:code/screen" element={<HostScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
