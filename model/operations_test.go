package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestOperationsAnalyticsUsesCompletionTimeAndHalfOpenRanges(t *testing.T) {
	originalDB := DB
	originalLocation := time.Local
	t.Cleanup(func() {
		DB = originalDB
		time.Local = originalLocation
	})
	time.Local = time.FixedZone("operations-test", 8*60*60)

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	require.NoError(t, DB.Exec(`CREATE TABLE quota_data (
		id INTEGER PRIMARY KEY, user_id INTEGER, username TEXT, created_at INTEGER,
		quota INTEGER, count INTEGER
	)`).Error)
	require.NoError(t, DB.Exec(`CREATE TABLE users (
		id INTEGER PRIMARY KEY, username TEXT, created_at INTEGER, deleted_at DATETIME
	)`).Error)
	require.NoError(t, DB.Exec(`CREATE TABLE top_ups (
		id INTEGER PRIMARY KEY, user_id INTEGER, money REAL, create_time INTEGER,
		complete_time INTEGER, status TEXT
	)`).Error)

	start := time.Date(2026, 9, 10, 0, 0, 0, 0, time.Local).Unix()
	end := time.Date(2026, 9, 12, 0, 0, 0, 0, time.Local).Unix()

	require.NoError(t, DB.Exec(`INSERT INTO quota_data
		(id, user_id, username, created_at, quota, count) VALUES
		(1, 1, 'alice', ?, 999, 1),
		(2, 1, 'alice', ?, 300, 3),
		(3, 2, 'bob', ?, 700, 2),
		(4, 2, 'bob', ?, 999, 1),
		(5, 1, 'alice-old-name', ?, 100, 1)`, start-1, start, end-1, end, start+100).Error)
	require.NoError(t, DB.Exec(`INSERT INTO users
		(id, username, created_at, deleted_at) VALUES
		(1, 'alice', ?, NULL),
		(2, 'bob', ?, NULL),
		(3, 'excluded-at-end', ?, NULL),
		(4, 'deleted-registration', ?, CURRENT_TIMESTAMP)`, start, end-1, end, start+100).Error)
	require.NoError(t, DB.Exec(`INSERT INTO top_ups
		(id, user_id, money, create_time, complete_time, status) VALUES
		(1, 1, 10.5, ?, ?, ?),
		(2, 2, 30, ?, ?, ?),
		(3, 2, 99, ?, ?, 'pending'),
		(4, 1, 88, ?, ?, ?)`,
		end+100, start, common.TopUpStatusSuccess,
		start, end-1, common.TopUpStatusSuccess,
		start, start+100,
		start, end, common.TopUpStatusSuccess,
	).Error)

	quotaSummary, err := GetOperationsQuotaSummary(start, end)
	require.NoError(t, err)
	assert.Equal(t, int64(1100), quotaSummary.TotalQuota)

	quotaRanking, err := GetOperationsQuotaUserRanking(start, end, 10)
	require.NoError(t, err)
	require.Len(t, quotaRanking, 2)
	assert.Equal(t, "bob", quotaRanking[0].Username)
	assert.Equal(t, int64(700), quotaRanking[0].Quota)
	assert.Equal(t, int64(2), quotaRanking[0].Count)
	assert.Equal(t, "alice", quotaRanking[1].Username)
	assert.Equal(t, int64(400), quotaRanking[1].Quota)
	assert.Equal(t, int64(4), quotaRanking[1].Count)

	registrations, err := GetOperationsRegistrations(start, end)
	require.NoError(t, err)
	require.Len(t, registrations, 2)
	assert.Equal(t, []OperationsRegistrationPoint{
		{Date: "2026-09-10", Count: 2},
		{Date: "2026-09-11", Count: 1},
	}, registrations)

	amount, orders, payers, err := GetOperationsTopUpSummary(start, end)
	require.NoError(t, err)
	assert.InDelta(t, 40.5, amount, 0.0001)
	assert.Equal(t, int64(2), orders)
	assert.Equal(t, int64(2), payers)

	trend, err := GetOperationsTopUpTrend(start, end)
	require.NoError(t, err)
	assert.Equal(t, []OperationsTopUpPoint{
		{Date: "2026-09-10", Amount: 10.5, OrderCount: 1, PayerCount: 1},
		{Date: "2026-09-11", Amount: 30, OrderCount: 1, PayerCount: 1},
	}, trend)

	topupRanking, err := GetOperationsTopUpUserRanking(start, end, 10)
	require.NoError(t, err)
	require.Len(t, topupRanking, 2)
	assert.Equal(t, "bob", topupRanking[0].Username)
	assert.InDelta(t, 30, topupRanking[0].Amount, 0.0001)
	assert.Equal(t, int64(1), topupRanking[0].OrderCount)
}
