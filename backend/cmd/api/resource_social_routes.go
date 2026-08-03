package main

import "net/http"

func (a *api) registerResourceSocialRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/v1/groups/{groupID}/resource-dashboard", a.requireAuth(http.HandlerFunc(a.resourceDashboard)))
	mux.Handle("PUT /api/v1/resources/{resourceID}/rating", a.requireAuth(http.HandlerFunc(a.rateResource)))
	mux.Handle("GET /api/v1/resources/{resourceID}/comments", a.requireAuth(http.HandlerFunc(a.resourceComments)))
	mux.Handle("POST /api/v1/resources/{resourceID}/comments", a.requireAuth(http.HandlerFunc(a.resourceComments)))
	mux.Handle("PATCH /api/v1/resources/{resourceID}", a.requireAuth(http.HandlerFunc(a.updateResource)))
	mux.Handle("DELETE /api/v1/resources/{resourceID}", a.requireAuth(http.HandlerFunc(a.deleteResource)))
	mux.Handle("GET /api/v1/groups/{groupID}/managed-members", a.requireAuth(http.HandlerFunc(a.managedMembers)))
	mux.Handle("PATCH /api/v1/groups/{groupID}/managed-members/{userID}", a.requireAuth(http.HandlerFunc(a.updateManagedMember)))
	mux.Handle("DELETE /api/v1/groups/{groupID}/managed-members/{userID}", a.requireAuth(http.HandlerFunc(a.deleteManagedMember)))
}
