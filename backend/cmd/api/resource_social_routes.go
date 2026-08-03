package main

import "net/http"

func (a *api) registerResourceSocialRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/v1/groups/{groupID}/resource-dashboard", a.requireAuth(http.HandlerFunc(a.resourceDashboard)))
	mux.Handle("PUT /api/v1/resources/{resourceID}/rating", a.requireAuth(http.HandlerFunc(a.rateResource)))
	mux.Handle("GET /api/v1/resources/{resourceID}/comments", a.requireAuth(http.HandlerFunc(a.resourceComments)))
	mux.Handle("POST /api/v1/resources/{resourceID}/comments", a.requireAuth(http.HandlerFunc(a.resourceComments)))
	mux.Handle("PATCH /api/v1/resources/{resourceID}", a.requireAuth(http.HandlerFunc(a.updateResource)))
	mux.Handle("DELETE /api/v1/resources/{resourceID}", a.requireAuth(http.HandlerFunc(a.deleteResource)))

	// Member administration routes. The members-admin alias is intentionally
	// versioned separately from the public member listing to avoid stale deployments.
	mux.Handle("GET /api/v1/groups/{groupID}/members-admin", a.requireAuth(http.HandlerFunc(a.managedMembers)))
	mux.Handle("PATCH /api/v1/groups/{groupID}/members-admin/{userID}", a.requireAuth(http.HandlerFunc(a.updateManagedMember)))
	mux.Handle("DELETE /api/v1/groups/{groupID}/members-admin/{userID}", a.requireAuth(http.HandlerFunc(a.deleteManagedMember)))
}
