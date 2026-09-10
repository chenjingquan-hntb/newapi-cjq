package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
)

const (
	BulkEmailMaxRecipients = 10000
	BulkEmailMaxSubject    = 200
	BulkEmailMaxContent    = 512 * 1024
	BulkEmailDefaultRate   = 2
	BulkEmailMaxRate       = 20
)

type BulkEmailRequest struct {
	Subject         string   `json:"subject"`
	Content         string   `json:"content"`
	Group           string   `json:"group,omitempty"`
	IncludeDisabled bool     `json:"include_disabled,omitempty"`
	RatePerSecond   int      `json:"rate_per_second,omitempty"`
	Recipients      []string `json:"recipients,omitempty"`
}

type BulkEmailState struct {
	Total     int `json:"total"`
	Processed int `json:"processed"`
	Succeeded int `json:"succeeded"`
	Failed    int `json:"failed"`
	Progress  int `json:"progress"`
}

type BulkEmailResult struct {
	Total     int `json:"total"`
	Succeeded int `json:"succeeded"`
	Failed    int `json:"failed"`
}

type bulkEmailRecipient struct {
	Email string
}

func NormalizeBulkEmailRequest(req BulkEmailRequest) (BulkEmailRequest, error) {
	req.Subject = strings.TrimSpace(req.Subject)
	req.Content = strings.TrimSpace(req.Content)
	req.Group = strings.TrimSpace(req.Group)
	if req.Subject == "" {
		return req, errors.New("email subject is required")
	}
	if strings.ContainsAny(req.Subject, "\r\n") {
		return req, errors.New("email subject must not contain line breaks")
	}
	if len([]byte(req.Subject)) > BulkEmailMaxSubject {
		return req, fmt.Errorf("email subject must be at most %d bytes", BulkEmailMaxSubject)
	}
	if req.Content == "" {
		return req, errors.New("email content is required")
	}
	if len([]byte(req.Content)) > BulkEmailMaxContent {
		return req, fmt.Errorf("email content must be at most %d bytes", BulkEmailMaxContent)
	}
	if req.RatePerSecond == 0 {
		req.RatePerSecond = BulkEmailDefaultRate
	}
	if req.RatePerSecond < 1 || req.RatePerSecond > BulkEmailMaxRate {
		return req, fmt.Errorf("rate_per_second must be between 1 and %d", BulkEmailMaxRate)
	}
	return req, nil
}

func bulkEmailRecipients(req BulkEmailRequest) ([]bulkEmailRecipient, error) {
	query := model.DB.Model(&model.User{}).
		Select("email").
		Where("email <> ''")
	if !req.IncludeDisabled {
		query = query.Where(&model.User{Status: common.UserStatusEnabled})
	}
	if req.Group != "" {
		query = query.Where(&model.User{Group: req.Group})
	}

	var rows []bulkEmailRecipient
	if err := query.Find(&rows).Error; err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(rows))
	recipients := make([]bulkEmailRecipient, 0, len(rows))
	for _, row := range rows {
		email := strings.TrimSpace(row.Email)
		key := strings.ToLower(email)
		if email == "" || key == "" || strings.ContainsAny(email, "\r\n") {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		recipients = append(recipients, bulkEmailRecipient{Email: email})
	}
	return recipients, nil
}

func CountBulkEmailRecipients(req BulkEmailRequest) (int, error) {
	recipients, err := bulkEmailRecipients(req)
	if err != nil {
		return 0, err
	}
	return len(recipients), nil
}

func StartBulkEmailTask(req BulkEmailRequest) (*model.SystemTask, int, error) {
	req, err := NormalizeBulkEmailRequest(req)
	if err != nil {
		return nil, 0, err
	}
	if active, err := model.GetActiveSystemTask(model.SystemTaskTypeBulkEmail); err != nil {
		return nil, 0, err
	} else if active != nil {
		return nil, 0, errors.New("a bulk email task is already pending or running")
	}

	recipients, err := bulkEmailRecipients(req)
	if err != nil {
		return nil, 0, err
	}
	if len(recipients) == 0 {
		return nil, 0, errors.New("no matching users with email addresses")
	}
	if len(recipients) > BulkEmailMaxRecipients {
		return nil, 0, fmt.Errorf("recipient count exceeds the maximum of %d", BulkEmailMaxRecipients)
	}

	// Snapshot recipients at task creation time so a restart cannot silently
	// resend to a changed user set or duplicate already-processed messages.
	req.Recipients = make([]string, 0, len(recipients))
	for _, recipient := range recipients {
		req.Recipients = append(req.Recipients, recipient.Email)
	}
	state := BulkEmailState{Total: len(recipients)}
	task, err := model.CreateSystemTask(model.SystemTaskTypeBulkEmail, req, state)
	if err != nil {
		// The active_key unique index is the authoritative concurrency guard.
		// Convert a concurrent submission into a stable client-facing error.
		if active, lookupErr := model.GetActiveSystemTask(model.SystemTaskTypeBulkEmail); lookupErr == nil && active != nil {
			return nil, 0, errors.New("a bulk email task is already pending or running")
		}
		return nil, 0, err
	}
	notifySystemTaskRunner()
	return task, len(recipients), nil
}

func RunBulkEmailTask(ctx context.Context, task *model.SystemTask, runnerID string) {
	var req BulkEmailRequest
	if err := task.DecodePayload(&req); err != nil {
		failSystemTask(task, runnerID, err)
		return
	}
	req, err := NormalizeBulkEmailRequest(req)
	if err != nil {
		failSystemTask(task, runnerID, err)
		return
	}
	hasRecipientSnapshot := len(req.Recipients) > 0
	var recipients []bulkEmailRecipient
	if hasRecipientSnapshot {
		recipients = make([]bulkEmailRecipient, 0, len(req.Recipients))
		for _, email := range req.Recipients {
			if email == "" || strings.ContainsAny(email, "\r\n") {
				continue
			}
			recipients = append(recipients, bulkEmailRecipient{Email: email})
		}
	} else {
		recipients, err = bulkEmailRecipients(req)
		if err != nil {
			failSystemTask(task, runnerID, err)
			return
		}
	}
	if len(recipients) > BulkEmailMaxRecipients {
		failSystemTask(task, runnerID, fmt.Errorf("recipient count exceeds the maximum of %d", BulkEmailMaxRecipients))
		return
	}

	state := BulkEmailState{Total: len(recipients)}
	if err := task.DecodeState(&state); err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("bulk email task %s state decode failed, restarting progress: %v", task.TaskID, err))
		state = BulkEmailState{Total: len(recipients)}
	}
	if state.Total != len(recipients) || state.Processed < 0 || state.Processed > len(recipients) || state.Succeeded < 0 || state.Failed < 0 || state.Succeeded+state.Failed != state.Processed {
		state = BulkEmailState{Total: len(recipients)}
	}
	// Tasks created before recipient snapshots were introduced cannot prove
	// that a recomputed recipient order is unchanged, so restart those safely.
	if !hasRecipientSnapshot && state.Processed > 0 {
		state = BulkEmailState{Total: len(recipients)}
	}

	interval := time.Second / time.Duration(req.RatePerSecond)
	initialProcessed := state.Processed
	for i := state.Processed; i < len(recipients); i++ {
		recipient := recipients[i]
		if err := ctx.Err(); err != nil {
			failSystemTask(task, runnerID, err)
			return
		}
		if i > initialProcessed {
			select {
			case <-ctx.Done():
				failSystemTask(task, runnerID, ctx.Err())
				return
			case <-time.After(interval):
			}
		}

		if err := sendBulkEmailWithRetry(ctx, req.Subject, recipient.Email, req.Content); err != nil {
			state.Failed++
			logger.LogWarn(ctx, fmt.Sprintf("bulk email task %s failed for %s: %v", task.TaskID, recipient.Email, err))
		} else {
			state.Succeeded++
		}
		state.Processed++
		state.Progress = 100
		if state.Total > 0 {
			state.Progress = state.Processed * 100 / state.Total
		}
		if err := model.UpdateSystemTaskState(task.TaskID, runnerID, state); err != nil {
			logSystemTaskLockError(ctx, task, err)
			return
		}
	}

	state.Progress = 100
	result := BulkEmailResult{Total: state.Total, Succeeded: state.Succeeded, Failed: state.Failed}
	if err := model.FinishSystemTask(task.TaskID, runnerID, model.SystemTaskStatusSucceeded, result, ""); err != nil {
		logSystemTaskLockError(ctx, task, err)
	}
}

func sendBulkEmailWithRetry(ctx context.Context, subject string, recipient string, content string) error {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := common.SendEmail(subject, recipient, content); err == nil {
			return nil
		} else {
			lastErr = err
		}
		if attempt < 2 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Duration(attempt+1) * time.Second):
			}
		}
	}
	return lastErr
}
