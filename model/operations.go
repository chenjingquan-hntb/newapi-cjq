package model

import (
	"cmp"
	"slices"
	"time"

	"github.com/QuantumNous/new-api/common"
)

type OperationsQuotaSummary struct {
	TotalQuota int64 `json:"total_quota" gorm:"column:total_quota"`
}

type OperationsUserRank struct {
	UserID   int    `json:"user_id" gorm:"column:user_id"`
	Username string `json:"username" gorm:"column:username"`
	Quota    int64  `json:"quota" gorm:"column:quota"`
	Count    int64  `json:"count" gorm:"column:count"`
}

type OperationsRegistrationPoint struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

type OperationsTopUpPoint struct {
	Date       string  `json:"date"`
	Amount     float64 `json:"amount"`
	OrderCount int64   `json:"order_count"`
	PayerCount int64   `json:"payer_count"`
}

type OperationsTopUpUserRank struct {
	UserID     int     `json:"user_id" gorm:"column:user_id"`
	Username   string  `json:"username" gorm:"column:username"`
	Amount     float64 `json:"amount" gorm:"column:amount"`
	OrderCount int64   `json:"order_count"`
}

type operationsRegistrationRow struct {
	CreatedAt int64 `gorm:"column:created_at"`
}

type operationsTopUpRow struct {
	UserID       int     `gorm:"column:user_id"`
	Money        float64 `gorm:"column:money"`
	CompleteTime int64   `gorm:"column:complete_time"`
}

func GetOperationsQuotaSummary(startTimestamp, endTimestamp int64) (OperationsQuotaSummary, error) {
	var summary OperationsQuotaSummary
	err := DB.Table("quota_data").
		Select("COALESCE(SUM(quota), 0) AS total_quota").
		Where("created_at >= ? AND created_at < ?", startTimestamp, endTimestamp).
		Scan(&summary).Error
	return summary, err
}

func GetOperationsQuotaUserRanking(startTimestamp, endTimestamp int64, limit int) ([]OperationsUserRank, error) {
	var ranking []OperationsUserRank
	query := DB.Table("quota_data").
		Select("user_id, MAX(username) AS username, SUM(quota) AS quota, SUM(count) AS count").
		Where("created_at >= ? AND created_at < ?", startTimestamp, endTimestamp).
		Group("user_id").
		Order("quota DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	if err := query.Find(&ranking).Error; err != nil {
		return nil, err
	}
	if len(ranking) == 0 {
		return ranking, nil
	}

	userIDs := make([]int, 0, len(ranking))
	for _, item := range ranking {
		userIDs = append(userIDs, item.UserID)
	}
	var users []User
	if err := DB.Unscoped().Select("id, username").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
		return nil, err
	}
	names := make(map[int]string, len(users))
	for _, user := range users {
		names[user.Id] = user.Username
	}
	for index := range ranking {
		if username := names[ranking[index].UserID]; username != "" {
			ranking[index].Username = username
		}
	}
	return ranking, nil
}

func GetOperationsRegistrations(startTimestamp, endTimestamp int64) ([]OperationsRegistrationPoint, error) {
	var rows []operationsRegistrationRow
	if err := DB.Unscoped().Model(&User{}).
		Select("created_at").
		Where("created_at >= ? AND created_at < ?", startTimestamp, endTimestamp).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	counts := make(map[string]int64)
	for _, row := range rows {
		date := time.Unix(row.CreatedAt, 0).In(time.Local).Format("2006-01-02")
		counts[date]++
	}
	points := make([]OperationsRegistrationPoint, 0, len(counts))
	for date, count := range counts {
		points = append(points, OperationsRegistrationPoint{Date: date, Count: count})
	}
	slices.SortFunc(points, func(a, b OperationsRegistrationPoint) int {
		return cmp.Compare(a.Date, b.Date)
	})
	return points, nil
}

func GetOperationsTopUpSummary(startTimestamp, endTimestamp int64) (float64, int64, int64, error) {
	var summary struct {
		Amount     float64 `gorm:"column:amount"`
		OrderCount int64   `gorm:"column:order_count"`
		PayerCount int64   `gorm:"column:payer_count"`
	}
	err := DB.Table("top_ups").
		Select("COALESCE(SUM(money), 0) AS amount, COUNT(*) AS order_count, COUNT(DISTINCT user_id) AS payer_count").
		Where("status = ? AND complete_time >= ? AND complete_time < ?", common.TopUpStatusSuccess, startTimestamp, endTimestamp).
		Scan(&summary).Error
	return summary.Amount, summary.OrderCount, summary.PayerCount, err
}

func GetOperationsTopUpTrend(startTimestamp, endTimestamp int64) ([]OperationsTopUpPoint, error) {
	var rows []operationsTopUpRow
	if err := DB.Table("top_ups").
		Select("user_id, money, complete_time").
		Where("status = ? AND complete_time >= ? AND complete_time < ?", common.TopUpStatusSuccess, startTimestamp, endTimestamp).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	type aggregate struct {
		amount   float64
		orders   int64
		payerIDs map[int]struct{}
	}
	aggregates := make(map[string]*aggregate)
	for _, row := range rows {
		date := time.Unix(row.CompleteTime, 0).In(time.Local).Format("2006-01-02")
		item := aggregates[date]
		if item == nil {
			item = &aggregate{payerIDs: make(map[int]struct{})}
			aggregates[date] = item
		}
		item.amount += row.Money
		item.orders++
		item.payerIDs[row.UserID] = struct{}{}
	}
	points := make([]OperationsTopUpPoint, 0, len(aggregates))
	for date, item := range aggregates {
		points = append(points, OperationsTopUpPoint{
			Date:       date,
			Amount:     item.amount,
			OrderCount: item.orders,
			PayerCount: int64(len(item.payerIDs)),
		})
	}
	slices.SortFunc(points, func(a, b OperationsTopUpPoint) int {
		return cmp.Compare(a.Date, b.Date)
	})
	return points, nil
}

func GetOperationsTopUpUserRanking(startTimestamp, endTimestamp int64, limit int) ([]OperationsTopUpUserRank, error) {
	var ranking []OperationsTopUpUserRank
	query := DB.Table("top_ups").
		Select("user_id, SUM(money) AS amount, COUNT(*) AS order_count").
		Where("status = ? AND complete_time >= ? AND complete_time < ?", common.TopUpStatusSuccess, startTimestamp, endTimestamp).
		Group("user_id").
		Order("amount DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	if err := query.Find(&ranking).Error; err != nil {
		return nil, err
	}
	if len(ranking) == 0 {
		return ranking, nil
	}

	userIDs := make([]int, 0, len(ranking))
	for _, item := range ranking {
		userIDs = append(userIDs, item.UserID)
	}
	var users []User
	if err := DB.Select("id, username").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
		return nil, err
	}
	names := make(map[int]string, len(users))
	for _, user := range users {
		names[user.Id] = user.Username
	}
	for index := range ranking {
		ranking[index].Username = names[ranking[index].UserID]
	}
	return ranking, nil
}
