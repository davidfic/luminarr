package db

import (
	"database/sql"
	"embed"
	"fmt"

	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate runs all pending database migrations.
// It is safe to call on every startup — goose is idempotent.
func Migrate(sqlDB *sql.DB, driver string) error {
	goose.SetBaseFS(migrationsFS)

	// goose dialect name for SQLite is "sqlite3".
	dialect := driver
	if driver == "sqlite" {
		dialect = "sqlite3"
	}

	if err := goose.SetDialect(dialect); err != nil {
		return fmt.Errorf("setting goose dialect %q: %w", dialect, err)
	}

	if err := goose.Up(sqlDB, "migrations"); err != nil {
		return fmt.Errorf("running migrations: %w", err)
	}

	return nil
}
