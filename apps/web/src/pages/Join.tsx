import { Navigate, useParams } from "react-router-dom";

/** /join/:code is a shareable invite link; joining itself happens on the room page. */
export function Join() {
  const { code } = useParams<{ code: string }>();
  return <Navigate to={`/room/${code}`} replace />;
}
