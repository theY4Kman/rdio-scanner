# Backend/Admin
- [ ] Perform config updates using upsert, instead of delete/insert
- [ ] Add admin route to update labels (for units, systems, talkgroups, etc.) — instead of uploading ENTIRE CONFIG on EVERY CHANGE

# Frontend
- [ ] Show TG names of last N queued calls in main display
- [ ] Show a sparkline of queued call volume over time

# Long-term goals
- [ ] Add some kind of "timeline" display, allowing an intuitive way to inspect and play calls in the past, and show calls currently queued ahead. Instead of a concept of "call memory", where any calls from avoided TGs not heard while live are lost forever (unless searched for), a concept of a "read head" would be used: users would move their read head through time, and configure desired TGs in a sidebar. When TGs are added or removed from the filter, calls would fly in before and after the read head.

   This more closely matches how I consume my instance: an interesting event comes over dispatch, and to be fully informed, or find closure, I also need to hear calls from ambulances or fire department at around the same time.
