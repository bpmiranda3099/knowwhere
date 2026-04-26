| Test Case Scenario ID | Test Case Scenario | Action | Actual Input | Expected Result |
|---|---|---|---|---|
| KN-NF-UAT-01 | Web pages load in a reasonable time | Open the home page, API documentation page, and Search page | **Pages**: Home, API docs, Search | Each page loads without “stuck loading” and becomes usable within a reasonable time |
| KN-NF-UAT-02 | Contact form prevents repeated submissions too quickly | Send one contact message, then try to send another one immediately | **Timing**: attempt the second send within about 1 minute | The second attempt is blocked with a “please wait” message, preventing rapid repeat submissions |
| KN-NF-UAT-03 | Web pages remain usable on common screen sizes | Open the site on a laptop-sized window and a phone-sized window | **Screens**: desktop/laptop and small mobile width | Navigation, text, and primary buttons remain readable and not cut off; you can still access Search and Contact |
| KN-NF-UAT-04 | Search results area stays scrollable and does not overlap columns | Perform a search and scroll through results in both columns | **Query text**: any query that returns multiple results | Results remain readable while scrolling; the two columns remain distinct and do not visually overlap |

