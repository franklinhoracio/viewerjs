export function getToken() {
  return localStorage.getItem("token");
}

export function getAuthHeaders(extra = {}) {
  const token = getToken();

  return {
    ...extra,
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
  };
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export function hasRole(allowedRoles = []) {
  const user = getUser();

  const roles = [
    user?.role,
    user?.rol,
    user?.roleName,
    user?.perfil,
    ...(Array.isArray(user?.roles) ? user.roles : []),
  ]
    .filter(Boolean)
    .map((r) => String(r).toUpperCase());

  return roles.some((r) =>
    allowedRoles.map((x) => String(x).toUpperCase()).includes(r)
  );
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.reload();
}
