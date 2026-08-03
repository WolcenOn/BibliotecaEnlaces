package main

import "net/http"

func (a *api) registerResourceSocialRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/v1/groups/{groupID}/resource-dashboard", a.requireAuth(http.HandlerFunc(a.resourceDashboard)))
	mux.Handle("PUT /api/v1/resources/{resourceID}/rating", a.requireAuth(http.HandlerFunc(a.rateResource)))
	mux.Handle("GET /api/v1/resources/{resourceID}/comments", a.requireAuth(http.HandlerFunc(a.resourceComments)))
	mux.Handle("POST /api/v1/resources/{resourceID}/comments", a.requireAuth(http.HandlerFunc(a.resourceComments)))
	mux.Handle("PATCH /api/v1/resources/{resourceID}", a.requireAuth(http.HandlerFunc(a.updateResource)))
	mux.Handle("DELETE /api/v1/resources/{resourceID}", a.requireAuth(http.HandlerFunc(a.deleteResource)))

	// Member administration routes. Keep the original path for deployed clients
	// and a separate alias that makes the backend change easy to verify.
	mux.Handle("GET /api/v1/groups/{groupID}/managed-members", a.requireAuth(http.HandlerFunc(a.managedMembers)))
	mux.Handle("PATCH /api/v1/groups/{groupID}/managed-members/{userID}", a.requireAuth(http.HandlerFunc(a.updateManagedMember)))
	mux.Handle("DELETE /api/v1/groups/{groupID}/managed-members/{userID}", a.requireAuth(http.HandlerFunc(a.deleteManagedMember)))
	mux.Handle("GET /api/v1/groups/{groupID}/members-admin", a.requireAuth(http.HandlerFunc(a.managedMembers)))
	mux.Handle("PATCH /api/v1/groups/{groupID}/members-admin/{userID}", a.requireAuth(http.HandlerFunc(a.updateManagedMember)))
	mux.Handle("DELETE /api/v1/groups/{groupID}/members-admin/{userID}", a.requireAuth(http.HandlerFunc(a.deleteManagedMember)))
}
