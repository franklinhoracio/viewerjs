import React, { useEffect, useState } from "react";
import "./App.css";
import StudyList from "./StudyList";
import ViewerPage from "./ViewerPage";
import Login from "./Login";
import { getToken } from "./auth";

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [loggedUser, setLoggedUser] = useState(null);

  useEffect(() => {
    const token = getToken();
    const userRaw = localStorage.getItem("user");

    if (token && userRaw) {
      try {
        setLoggedUser(JSON.parse(userRaw));
      } catch {
        localStorage.removeItem("user");
      }
    }

    setAuthReady(true);
  }, []);

  if (!authReady) return null;

  if (!getToken()) {
    return <Login onLogin={(user) => setLoggedUser(user)} />;
  }

  const params = new URLSearchParams(window.location.search);
  const page = params.get("page");
  const studyId = params.get("study");

  const goToStudyList = () => {
    window.location.href = `${window.location.pathname}?page=study_list`;
  };

  if (!page || page === "study_list") {
    return <StudyList user={loggedUser} />;
  }

  if (page === "viewer" && studyId) {
    return <ViewerPage />;
  }

  goToStudyList();
  return null;
}