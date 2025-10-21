middleware      
                >>  ensureAuthenticated     if (req.session.user)   >>  next   
                                            failed  >>  /login
                
                >>  ensureAdmin             if (!req.session.user)  >>  /login
                                            if (req.session.user.role === 'admin')     >>  next
                                            failed  >>  /

                >>  ensureSuperuserOrAdmin  if (!req.session.user)  >>  /login
                                            if (role === 'admin' || role === 'superuser')   >>  next
                                            failed  >>  /
                
                >>  ensureUser              if (!req.session.user)  >>  /login
                                            if (req.session.user.role === 'user')   >>  next
                                            failed  >>  /


ageCategories   >>  get     /           >>  /ageCategories/index
                >>  get     /ad         >>  /ageCategories/add
                >>  post    /add        >>  success >>  /ageCategories
                >>  get     /edit/:id   >>  /ageCategories/edi
                >>  post    /edit/:id   >>  success >>  /ageCategories
                >>  get     /delete/:id >>  success >>  /ageCategories
            
athleteCheck    >>  get     /age-check  >>  success >>  athletes/ageCheck

athletes        >>  get    /                    >>  /athletes/index
                >>  get    /add                 >>  /athletes/add
                >>  post   /add                 >>  success >>  /athletes
                >>  get    /edit/:id            >>  /athletes/edit
                >>  post   /edit/:id            >>  success >>  /athletes
                >>  get    /delete/:id          >>  /athletes
                >>  get    /search              >>  /athletes/search
                >>  get    /ranking             >>  /athletes/ranking
                >>  get    /byCategory/:id      >>  /athletes/byCategory <<BackLink>>    /ageCategories
                >>  post   /moveCategory/:id    >>  success >>  /athletes/byCategory

backup
        backupDatabase  >>  success >>  /

choose_Athletes_for_tournament  >>  get     /declare    >>  tournaments/declare
                                >>  post    /declare    >>  success >>  /tournaments/declare

clubs           >>  get     /               >>  clubs/index
                >>  get     /add            >>  /clubs
                >>  get     /edit/:id       >>  clubs/edit
                >>  post    /clubs/edit     >>  success >>  /clubs
                >>  get     /delete/:id     >>  /clubs
                >>  get     /:id/athlete    >>  clubs/athletes  <<List Athletes in that club>>
                >>  get     /:clubId/athletes/:athleteId/transfer   >>  clubs/transfer
                >>  post    /:clubId/athletes/:athleteId/transfer   >>  success >>  /clubs/${newClubId}/athletes

dataRoutes
                >>  get     /athletes           >>  athletes
                >>  get     /tournaments        >>  tournaments
                >>  get     /weight-categories  >>  weight_categories
                >>  get     /users              >>  users
                >>  get     /age-categories     >>  ageCategories              

logs
                >>  get     /                   >>  logs/index
                >>  get     /download/:filename >>  /logs

ranking
                >>  get     /preview    >>  ranking/rankingPreview

restore
                >>  get     /                   >>  backup/restore
                >>  post    /upload             >>  success     >>      /restore
                >>  post    /                   >>  success     >>      /restore
                >>  get     /download/:filename >>  download(filePath)
                >>  post    /delete             >>  success     >>      /restore

tournament_register     >>     get      /:tournamentId/register >>  tournaments/register
                        >>     post     /:tournamentId/register >>  success  >>  /tournaments/${req.params.tournamentId}/register
                        >>     get      /:tournamentId/register >>  tournaments/dilwsi
                        >>     post     /:tournamentId/registe  >>  success >>  /tournaments/${tournamentId}/register


tournamentRegistration  >>      get     /:tournamentId/register >>  tournaments/dilwsi
                        >>      post    /:tournamentId/register >>  success >>  /tournaments/${tournamentId}/register

tournaments     >>  get    /                        >>  tournaments/list
                >>  get    /add                     >>  tournaments/add
                >>  post   tournaments/add          >>  success >>  /tournaments
                >>  get    /edit/:id                >>  tournaments/edit
                >>  post   /edit/:id                >>  success   >>    /tournaments
                >>  post   /delete/:id              >>  success   >>    /tournaments
                >>  get    /:tournamentId/register  >>  tournaments/register
                >>  post   /:tournamentId/register  >>  success   >>    /tournaments/${tournamentId}/register
                >>  get    /:tournamentId/approvals >>  tournaments/approvals
                >>  post   /:tournamentId/approve/:athleteId    >>  success >>  /tournaments/${tournamentId}/approvals  
                >>  post   /:tournamentId/reject/:athleteId     >>  success >>  /tournaments/${tournamentId}/approvals

weightCategories    >>  get     /               >>  weightCategories/index
                    >>  get     /add            >>  weightCategories/add
                    >>  post    /add            >>  success     >>  weightCategories
                    >>  get     /edit/:id       >>  weightCategories/edit
                    >>  post    /edit/:id       >>  success     >>  /weightCategories
                    >>  get     /delete/:id     >>  /weightCategories
                    >>  get     /:id/athletes   >>  /:id/athletes   >>  weightCategories/athletes


