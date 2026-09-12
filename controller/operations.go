package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

const operationsMaxRange = 31 * 24 * time.Hour

func parseOperationsTimeRange(c *gin.Context) (int64, int64, bool) {
	startTimestamp, err := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	if err != nil || startTimestamp <= 0 {
		common.ApiErrorMsg(c, "invalid start_timestamp")
		return 0, 0, false
	}
	endTimestamp, err := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if err != nil || endTimestamp <= startTimestamp {
		common.ApiErrorMsg(c, "invalid end_timestamp")
		return 0, 0, false
	}
	if endTimestamp-startTimestamp > int64(operationsMaxRange/time.Second) {
		common.ApiErrorMsg(c, "time range cannot exceed 31 days")
		return 0, 0, false
	}
	return startTimestamp, endTimestamp, true
}

func GetOperationsSummary(c *gin.Context) {
	startTimestamp, endTimestamp, ok := parseOperationsTimeRange(c)
	if !ok {
		return
	}

	quota, err := model.GetOperationsQuotaSummary(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	registrations, err := model.GetOperationsRegistrations(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	topupAmount, orderCount, payerCount, err := model.GetOperationsTopUpSummary(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	previousStart, previousEnd, hasPrevious, previousValid := parseOptionalOperationsPreviousRange(c)
	if !previousValid {
		return
	}

	response := gin.H{
		"quota": gin.H{
			"total":                   quota.TotalQuota,
			"export_enabled":          common.DataExportEnabled,
			"export_interval_minutes": common.DataExportInterval,
		},
		"new_users": gin.H{"count": sumRegistrationCounts(registrations)},
		"topups": gin.H{
			"amount":      topupAmount,
			"order_count": orderCount,
			"payer_count": payerCount,
		},
		"updated_at": time.Now().Unix(),
	}
	if hasPrevious {
		previousQuota, previousErr := model.GetOperationsQuotaSummary(previousStart, previousEnd)
		if previousErr != nil {
			common.ApiError(c, previousErr)
			return
		}
		previousRegistrations, previousErr := model.GetOperationsRegistrations(previousStart, previousEnd)
		if previousErr != nil {
			common.ApiError(c, previousErr)
			return
		}
		previousTopUpAmount, _, _, previousErr := model.GetOperationsTopUpSummary(previousStart, previousEnd)
		if previousErr != nil {
			common.ApiError(c, previousErr)
			return
		}
		response["previous"] = gin.H{
			"quota":        previousQuota.TotalQuota,
			"new_users":    sumRegistrationCounts(previousRegistrations),
			"topup_amount": previousTopUpAmount,
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": response})
}

func GetOperationsQuotaRanking(c *gin.Context) {
	startTimestamp, endTimestamp, ok := parseOperationsTimeRange(c)
	if !ok {
		return
	}
	limit := parseOperationsLimit(c)
	ranking, err := model.GetOperationsQuotaUserRanking(startTimestamp, endTimestamp, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": ranking})
}

func GetOperationsRegistrations(c *gin.Context) {
	startTimestamp, endTimestamp, ok := parseOperationsTimeRange(c)
	if !ok {
		return
	}
	points, err := model.GetOperationsRegistrations(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": points})
}

func GetOperationsTopUps(c *gin.Context) {
	startTimestamp, endTimestamp, ok := parseOperationsTimeRange(c)
	if !ok {
		return
	}
	points, err := model.GetOperationsTopUpTrend(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	limit := parseOperationsLimit(c)
	ranking, err := model.GetOperationsTopUpUserRanking(startTimestamp, endTimestamp, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    gin.H{"points": points, "ranking": ranking},
	})
}

func GetOperationsFinance(c *gin.Context) {
	startTimestamp, endTimestamp, ok := parseOperationsTimeRange(c)
	if !ok {
		return
	}
	amount, _, _, err := model.GetOperationsTopUpSummary(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"status":        "pending_upstream_integration",
			"net_profit":    nil,
			"profit_margin": nil,
			"revenue":       amount,
			"upstream_cost": nil,
			"currency":      "",
			"updated_at":    time.Now().Unix(),
		},
	})
}

func parseOptionalOperationsPreviousRange(c *gin.Context) (int64, int64, bool, bool) {
	startValue, endValue := c.Query("previous_start_timestamp"), c.Query("previous_end_timestamp")
	if startValue == "" && endValue == "" {
		return 0, 0, false, true
	}
	startTimestamp, err := strconv.ParseInt(startValue, 10, 64)
	if err != nil || startTimestamp <= 0 {
		common.ApiErrorMsg(c, "invalid previous_start_timestamp")
		return 0, 0, false, false
	}
	endTimestamp, err := strconv.ParseInt(endValue, 10, 64)
	if err != nil || endTimestamp <= startTimestamp {
		common.ApiErrorMsg(c, "invalid previous_end_timestamp")
		return 0, 0, false, false
	}
	if endTimestamp-startTimestamp > int64(operationsMaxRange/time.Second) {
		common.ApiErrorMsg(c, "previous time range cannot exceed 31 days")
		return 0, 0, false, false
	}
	return startTimestamp, endTimestamp, true, true
}

func parseOperationsLimit(c *gin.Context) int {
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if err != nil || limit < 1 {
		return 10
	}
	if limit > 100 {
		return 100
	}
	return limit
}

func sumRegistrationCounts(points []model.OperationsRegistrationPoint) int64 {
	var total int64
	for _, point := range points {
		total += point.Count
	}
	return total
}
