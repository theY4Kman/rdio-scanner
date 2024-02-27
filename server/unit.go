// Copyright (C) 2019-2022 Chrystian Huot <chrystian.huot@saubeo.solutions>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
)

type Unit struct {
	Id    uint   `json:"id"`
	Label string `json:"label"`
	Order uint   `json:"order"`
}

func (unit *Unit) FromMap(m map[string]any) *Unit {
	switch v := m["id"].(type) {
	case float64:
		unit.Id = uint(v)
	}

	switch v := m["label"].(type) {
	case string:
		unit.Label = v
	}

	switch v := m["order"].(type) {
	case float64:
		unit.Order = uint(v)
	}

	return unit
}

type Units struct {
	List  []*Unit
	mutex sync.Mutex
}

func NewUnits() *Units {
	return &Units{
		List:  []*Unit{},
		mutex: sync.Mutex{},
	}
}

func (units *Units) Add(id uint, label string) (*Units, bool) {
	added := true

	for _, u := range units.List {
		if u.Id == id {
			added = false
			break
		}
	}

	if added {
		units.List = append(units.List, &Unit{Id: id, Label: label})
	}

	return units, added
}

func (units *Units) FromMap(f []any) *Units {
	units.mutex.Lock()
	defer units.mutex.Unlock()

	units.List = []*Unit{}

	for _, r := range f {
		switch m := r.(type) {
		case map[string]any:
			unit := &Unit{}
			unit.FromMap(m)
			units.List = append(units.List, unit)
		}
	}

	return units
}

func (units *Units) FromMapPatch(f []any) *Units {
	units.mutex.Lock()
	defer units.mutex.Unlock()

	for _, r := range f {
		switch m := r.(type) {
		case map[string]any:
			isDeleting := m["label"] == nil

			unit, ok := units.getUnit(m["id"])
			if !ok {
				if isDeleting {
					continue
				}

				unit = &Unit{}
				units.List = append(units.List, unit)
			}

			if isDeleting {
				units.deleteUnit(unit)
				continue
			}

			unit.FromMap(m)
		}
	}

	return units
}

func (units *Units) GetUnit(f any) (unit *Unit, ok bool) {
	units.mutex.Lock()
	defer units.mutex.Unlock()

	return units.getUnit(f)
}

func (units *Units) getUnit(f any) (unit *Unit, ok bool) {
	switch f.(type) {
	case float64:
		f = uint(f.(float64))
	}

	switch v := f.(type) {
	case uint:
		for _, unit := range units.List {
			if unit.Id == v {
				return unit, true
			}
		}
	case string:
		for _, unit := range units.List {
			if unit.Label == v {
				return unit, true
			}
		}
	}

	return nil, false
}

func (units *Units) deleteUnit(unit *Unit) bool {
	for i, u := range units.List {
		if u == unit {
			units.List = append(units.List[:i], units.List[i+1:]...)
			return true
		}
	}

	return false
}

func (units *Units) Merge(newUnits *Units) bool {
	merged := false

	if newUnits != nil {
		units.mutex.Lock()
		defer units.mutex.Unlock()

		for _, v := range newUnits.List {
			if _, added := units.Add(v.Id, v.Label); added {
				merged = added
			}
		}
	}

	return merged
}

func (units *Units) Read(db *Database, systemId uint) error {
	var (
		err  error
		rows *sql.Rows
	)

	units.mutex.Lock()
	defer units.mutex.Unlock()

	units.List = []*Unit{}

	formatError := func(err error) error {
		return fmt.Errorf("units.read: %v", err)
	}

	if rows, err = db.Sql.Query("select `id`, `label`, `order` from `rdioScannerUnits` where `systemId` = ?", systemId); err != nil {
		return formatError(err)
	}

	for rows.Next() {
		unit := &Unit{}

		if err = rows.Scan(&unit.Id, &unit.Label, &unit.Order); err != nil {
			break
		}

		units.List = append(units.List, unit)
	}

	rows.Close()

	if err != nil {
		return formatError(err)
	}

	sort.Slice(units.List, func(i int, j int) bool {
		return units.List[i].Order < units.List[j].Order
	})

	return nil
}

func (units *Units) Write(db *Database, systemId uint) error {
	var (
		err  error
		ids  = []uint{}
		rows *sql.Rows
	)

	units.mutex.Lock()
	defer units.mutex.Unlock()

	formatError := func(err error) error {
		return fmt.Errorf("units.write: %v", err)
	}

	if rows, err = db.Sql.Query("select `id` from `rdioScannerUnits` where `systemId` = ?", systemId); err != nil {
		return formatError(err)
	}

	for rows.Next() {
		var id uint
		if err = rows.Scan(&id); err != nil {
			break
		}
		remove := true
		for _, unit := range units.List {
			if unit.Id == id {
				remove = false
				break
			}
		}
		if remove {
			ids = append(ids, id)
		}
	}

	rows.Close()

	if err != nil {
		return formatError(err)
	}

	ctx := context.Background()
	tx, err := db.Sql.BeginTx(ctx, nil)
	if err != nil {
		return formatError(err)
	}
	defer tx.Rollback()

	if len(ids) > 0 {
		if b, err := json.Marshal(ids); err == nil {
			s := string(b)
			s = strings.ReplaceAll(s, "[", "(")
			s = strings.ReplaceAll(s, "]", ")")
			q := fmt.Sprintf("delete from `rdioScannerUnits` where `id` in %v and `systemId` = %v", s, systemId)
			if _, err = tx.ExecContext(ctx, q); err != nil {
				return formatError(err)
			}
		}
	}

	// SQLite has a limit of 999 parameters per query. We use 990 to be safe.
	maxParams := 990
	args := make([]interface{}, 0, len(units.List)*4)
	valuesRows := make([]string, 0, len(units.List))

	emitUpsert := func() error {
		if len(valuesRows) == 0 {
			return nil
		}

		q := fmt.Sprintf(`
			INSERT INTO rdioScannerUnits (id, label, "order", systemId)
			VALUES %s
			ON CONFLICT (id, systemId) DO UPDATE
			SET label = EXCLUDED.label, "order" = EXCLUDED."order"
		`, strings.Join(valuesRows, ","))

		if _, err = tx.ExecContext(ctx, q, args...); err != nil {
			return formatError(err)
		}

		args = args[:0]
		valuesRows = valuesRows[:0]

		return nil
	}

	for _, unit := range units.List {
		if len(args) >= maxParams {
			if err := emitUpsert(); err != nil {
				return err
			}
		}

		args = append(args, unit.Id, unit.Label, unit.Order, systemId)
		valuesRows = append(valuesRows, "(?, ?, ?, ?)")
	}
	if len(args) > 0 {
		if err := emitUpsert(); err != nil {
			return err
		}
	}

	if err = tx.Commit(); err != nil {
		return formatError(err)
	}

	return nil
}
