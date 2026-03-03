package testutil

import (
	"encoding/json"
	"testing"
)

// AssertNoError calls t.Fatal if err is non-nil.
func AssertNoError(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// AssertError calls t.Fatal if err is nil.
func AssertError(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("expected an error but got nil")
	}
}

// AssertEqual calls t.Errorf if got != want.
func AssertEqual[T comparable](t *testing.T, want, got T) {
	t.Helper()
	if got != want {
		t.Errorf("want %v, got %v", want, got)
	}
}

// AssertNotEqual calls t.Errorf if got == notWant.
func AssertNotEqual[T comparable](t *testing.T, notWant, got T) {
	t.Helper()
	if got == notWant {
		t.Errorf("expected value to differ from %v", notWant)
	}
}

// AssertContains calls t.Errorf if slice does not contain elem.
func AssertContains[T comparable](t *testing.T, slice []T, elem T) {
	t.Helper()
	for _, v := range slice {
		if v == elem {
			return
		}
	}
	t.Errorf("slice does not contain %v", elem)
}

// AssertLen calls t.Errorf if len(slice) != want.
func AssertLen[T any](t *testing.T, slice []T, want int) {
	t.Helper()
	if len(slice) != want {
		t.Errorf("want len %d, got %d", want, len(slice))
	}
}

// AssertJSONEqual marshals both values to JSON and compares the results.
// Useful for comparing structs that contain unexported fields or time.Time values.
func AssertJSONEqual(t *testing.T, want, got any) {
	t.Helper()
	wantBytes, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("AssertJSONEqual: marshal want: %v", err)
	}
	gotBytes, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("AssertJSONEqual: marshal got: %v", err)
	}
	if string(wantBytes) != string(gotBytes) {
		t.Errorf("JSON mismatch:\nwant: %s\n got: %s", wantBytes, gotBytes)
	}
}
