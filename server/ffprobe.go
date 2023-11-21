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
	"bytes"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

type FFProbe struct {
	available bool
	warned    bool
}

func NewFFProbe() *FFProbe {
	ffprobe := &FFProbe{}

	stdout := bytes.NewBuffer([]byte(nil))

	cmd := exec.Command("ffprobe", "-version")
	cmd.Stdout = stdout

	if err := cmd.Run(); err == nil {
		ffprobe.available = true
	}

	return ffprobe
}

func (ffprobe *FFProbe) CalculateDuration(call *Call) error {
	var err error

	if !ffprobe.available {
		if !ffprobe.warned {
			ffprobe.warned = true

			return errors.New("ffprobe is not available, no duration calculation can be performed")
		}
		return nil
	}

	stdout := bytes.NewBuffer([]byte(nil))
	stderr := bytes.NewBuffer([]byte(nil))

	cmd := exec.Command(
		"ffprobe",
		"-show_entries", "format=duration", // only show duration
		"-v", "error",
		"-of", "csv=p=0",
		"pipe:0", // read from stdin
	)
	cmd.Stdin = bytes.NewReader(call.Audio)
	cmd.Stdout = stdout
	cmd.Stderr = stderr

	if err = cmd.Run(); err != nil {
		fmt.Println(stderr.String())
		return err
	}

	rawDuration := strings.TrimSpace(stdout.String())
	if duration, err := strconv.ParseFloat(rawDuration, 64); err == nil {
		call.AudioDuration = duration
	} else {
		return errors.New(fmt.Sprintf("Error parsing audio duration (%v): %v", stdout.String(), err))
	}

	return nil
}
