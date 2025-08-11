class BigQuerySQLGenerator {
    constructor() {
        this.currentStep = 1;
        this.maxSteps = 5; // 총 5단계
        this.taxonomy = null;
        this.selectedTemplate = null;
        this.generatedSQL = null;
        this.queryResults = null;
        this.selectedProject = null;
        this.selectedDataset = null;
        this.isAuthenticated = false;
        
        this.init();
    }

    init() {
        this.checkAuthStatus();
        this.attachEventListeners();
    }

    attachEventListeners() {
        // 로그인 버튼
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                window.location.href = '/api/auth/google';
            });
        }

        document.getElementById('load-taxonomy').addEventListener('click', () => this.loadTaxonomy());
        document.getElementById('dataset-select').addEventListener('change', (e) => this.onDatasetSelect(e));
        document.getElementById('generate-sql').addEventListener('click', () => this.generateSQL());
        document.getElementById('validate-query').addEventListener('click', () => this.validateQuery());
        document.getElementById('execute-query').addEventListener('click', () => this.executeQuery());
        document.getElementById('save-as-view').addEventListener('click', () => this.saveAsView());
        document.getElementById('export-csv').addEventListener('click', () => this.exportResults('csv'));
        document.getElementById('next-step').addEventListener('click', () => this.nextStep());
        document.getElementById('prev-step').addEventListener('click', () => this.prevStep());
        
        // 프로젝트 검색
        document.getElementById('project-search').addEventListener('input', (e) => this.searchProjects(e.target.value));
        
        // 조직 필터
        document.getElementById('organization-filter').addEventListener('change', (e) => this.filterByOrganization(e.target.value));
        
        // 필터 칩
        document.querySelectorAll('.filter-chips .chip').forEach(chip => {
            chip.addEventListener('click', (e) => this.applyFilter(e.target.dataset.filter));
        });

        document.querySelectorAll('.template-card').forEach(card => {
            card.addEventListener('click', (e) => this.selectTemplate(e));
        });

        document.querySelectorAll('.step').forEach(step => {
            step.addEventListener('click', (e) => {
                const stepNum = parseInt(e.currentTarget.dataset.step);
                if (stepNum <= this.currentStep) {
                    this.goToStep(stepNum);
                }
            });
        });
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            
            const authStatus = document.getElementById('auth-status');
            const loginScreen = document.getElementById('login-screen');
            const mainContent = document.getElementById('main-content');
            const footer = document.getElementById('footer');
            
            if (data.authenticated || data.hasServiceAccount) {
                this.isAuthenticated = true;
                authStatus.innerHTML = `
                    <span style="margin-right: 16px;">✓ 인증됨</span>
                    <button class="logout-btn" onclick="logout()">로그아웃</button>
                `;
                
                // 로그인 화면 숨기고 메인 컨텐츠 표시
                loginScreen.classList.add('hidden');
                mainContent.classList.remove('hidden');
                footer.classList.remove('hidden');
                
                // 프로젝트 목록 자동 로드
                setTimeout(() => {
                    this.loadProjects();
                }, 500);
            } else {
                this.isAuthenticated = false;
                authStatus.innerHTML = '';
                
                // 메인 컨텐츠 숨기고 로그인 화면 표시
                loginScreen.classList.remove('hidden');
                mainContent.classList.add('hidden');
                footer.classList.add('hidden');
            }
        } catch (error) {
            console.error('인증 상태 확인 실패:', error);
        }
    }

    async loadTaxonomy() {
        const url = document.getElementById('sheets-url').value;
        if (!url) {
            this.showMessage('Google Sheets URL을 입력해주세요.', 'error');
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch('/api/sheets/load-taxonomy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spreadsheetUrl: url })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    this.showMessage('인증이 필요합니다. 다시 로그인해주세요.', 'error');
                    setTimeout(() => {
                        window.location.href = '/api/auth/google';
                    }, 2000);
                    return;
                }
                throw new Error('택소노미 로드 실패');
            }

            const data = await response.json();
            this.taxonomy = data.taxonomy;
            this.displayTaxonomyInfo(data.taxonomy);
            
            this.showMessage('택소노미를 성공적으로 로드했습니다.', 'success');
            document.getElementById('next-step').disabled = false;
        } catch (error) {
            this.showMessage('택소노미 로드 실패: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayTaxonomyInfo(taxonomy) {
        const preview = document.getElementById('taxonomy-preview');
        const info = document.getElementById('taxonomy-info');
        
        info.innerHTML = `
            <div class="taxonomy-stats">
                <p><strong>이벤트 수:</strong> ${taxonomy.events.length}개</p>
                <p><strong>프로젝트 ID:</strong> ${taxonomy.projectInfo.bigquery_project || '미설정'}</p>
                <p><strong>데이터셋 ID:</strong> ${taxonomy.projectInfo.dataset_id || '미설정'}</p>
                <div class="event-list-preview">
                    <strong>주요 이벤트:</strong>
                    <ul>
                        ${taxonomy.events.slice(0, 5).map(e => 
                            `<li>${e.event_name} - ${e.description}</li>`
                        ).join('')}
                    </ul>
                    ${taxonomy.events.length > 5 ? `<p>외 ${taxonomy.events.length - 5}개...</p>` : ''}
                </div>
            </div>
        `;
        
        preview.classList.remove('hidden');
    }

    async loadProjects() {
        this.showLoading(true);
        try {
            // 리소스 정보 로드 (조직, 폴더, 프로젝트)
            const resourcesResponse = await fetch('/api/projects/resources');
            const resources = await resourcesResponse.json();
            
            // 조직 필터 설정
            const orgFilter = document.getElementById('organization-filter');
            orgFilter.innerHTML = '<option value="">모든 조직</option>';
            resources.organizations?.forEach(org => {
                const option = document.createElement('option');
                option.value = org.name;
                option.textContent = org.displayName || org.name;
                orgFilter.appendChild(option);
            });
            
            // 프로젝트 목록 표시
            this.displayProjects(resources.projects);
            
            // 프로젝트 목록이 로드되면 다음 버튼 활성화
            if (resources.projects && resources.projects.length > 0) {
                document.getElementById('next-step').disabled = false;
            }
        } catch (error) {
            this.showMessage('프로젝트 목록 로드 실패: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayProjects(projects) {
        const projectList = document.getElementById('project-list');
        projectList.innerHTML = '';
        
        if (!projects || projects.length === 0) {
            projectList.innerHTML = '<div class="no-projects">프로젝트가 없습니다.</div>';
            return;
        }
        
        projects.forEach(project => {
            const projectItem = document.createElement('div');
            projectItem.className = 'project-item';
            projectItem.dataset.projectId = project.projectId;
            
            projectItem.innerHTML = `
                <div class="project-info">
                    <div class="project-name">${project.displayName || project.name || project.projectId}</div>
                    <div class="project-id">${project.projectId}</div>
                </div>
                <div class="project-meta">
                    <span class="project-type">프로젝트</span>
                </div>
            `;
            
            projectItem.addEventListener('click', () => this.selectProject(project));
            projectList.appendChild(projectItem);
        });
    }

    selectProject(project) {
        // 이전 선택 해제
        document.querySelectorAll('.project-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 새로운 프로젝트 선택
        const projectItem = document.querySelector(`[data-project-id="${project.projectId}"]`);
        if (projectItem) {
            projectItem.classList.add('selected');
        }
        
        this.selectedProject = project.projectId;
        
        // 4단계에서 표시할 프로젝트 정보 저장
        const projectDisplay = document.getElementById('selected-project-display');
        if (projectDisplay) {
            projectDisplay.textContent = project.projectId;
        }
    }

    async loadDatasets() {
        if (!this.selectedProject) {
            this.showMessage('프로젝트를 먼저 선택해주세요.', 'error');
            return;
        }

        const datasetSelect = document.getElementById('dataset-select');
        datasetSelect.innerHTML = '<option value="">데이터셋을 선택하세요</option>';
        
        this.showLoading(true);
        try {
            const response = await fetch(`/api/bigquery/projects/${this.selectedProject}/datasets`);
            const data = await response.json();
            
            data.datasets.forEach(dataset => {
                const option = document.createElement('option');
                const datasetId = dataset.datasetId || dataset.id;
                option.value = datasetId;
                option.textContent = datasetId;
                datasetSelect.appendChild(option);
            });
            
            if (data.datasets.length > 0) {
                document.getElementById('next-step').disabled = false;
            }
        } catch (error) {
            this.showMessage('데이터셋 목록 로드 실패: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async searchProjects(query) {
        if (!query) {
            await this.loadProjects();
            return;
        }
        
        this.showLoading(true);
        try {
            const response = await fetch(`/api/projects/search?query=${encodeURIComponent(query)}`);
            const data = await response.json();
            this.displayProjects(data.projects);
        } catch (error) {
            this.showMessage('프로젝트 검색 실패: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }
    
    filterByOrganization(orgName) {
        // 조직별 필터링 로직
        if (!orgName) {
            this.loadProjects();
        } else {
            // 선택된 조직의 프로젝트만 표시
            this.showMessage('조직 필터 적용 중...', 'info');
        }
    }
    
    applyFilter(filterType) {
        // 필터 칩 활성화
        document.querySelectorAll('.filter-chips .chip').forEach(chip => {
            chip.classList.remove('active');
        });
        document.querySelector(`.filter-chips .chip[data-filter="${filterType}"]`).classList.add('active');
        
        // 필터 적용
        switch(filterType) {
            case 'recent':
                // 최근 사용한 프로젝트 표시
                this.showMessage('최근 사용 프로젝트 로드 중...', 'info');
                break;
            case 'starred':
                // 즐겨찾기 프로젝트 표시
                this.showMessage('즐겨찾기 프로젝트 로드 중...', 'info');
                break;
            default:
                this.loadProjects();
        }
    }

    async onDatasetSelect(event) {
        const datasetId = event.target.value;
        if (!datasetId) return;
        
        this.selectedDataset = datasetId;
        
        this.showLoading(true);
        try {
            const response = await fetch(`/api/bigquery/projects/${this.selectedProject}/datasets/${datasetId}/tables`);
            const data = await response.json();
            
            const ga4Detection = document.getElementById('ga4-detection');
            if (data.ga4Detection.hasGA4Data) {
                ga4Detection.className = 'alert success';
                ga4Detection.innerHTML = `✓ GA4 이벤트 테이블 감지됨 (${data.ga4Detection.tables.length}개 테이블)`;
            } else {
                ga4Detection.className = 'alert warning';
                ga4Detection.innerHTML = '⚠ GA4 이벤트 테이블을 찾을 수 없습니다.';
            }
            ga4Detection.classList.remove('hidden');
        } catch (error) {
            this.showMessage('테이블 확인 실패: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    selectTemplate(event) {
        document.querySelectorAll('.template-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        const card = event.currentTarget;
        card.classList.add('selected');
        
        this.selectedTemplate = card.dataset.template;
        this.loadParameterForm(this.selectedTemplate);
    }

    async loadParameterForm(templateKey) {
        const parameterForm = document.getElementById('parameter-form');
        const parameterInputs = document.getElementById('parameter-inputs');
        
        try {
            const response = await fetch('/api/sql/suggest-parameters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateKey })
            });
            
            const data = await response.json();
            const suggestions = data.suggestions;
            
            parameterInputs.innerHTML = `
                <div class="parameter-input-group">
                    <label>날짜 범위</label>
                    <div class="date-range-selector">
                        <button data-range="last_7_days">최근 7일</button>
                        <button data-range="last_30_days">최근 30일</button>
                        <button data-range="yesterday">어제</button>
                        <button data-range="custom">직접 입력</button>
                    </div>
                    <div class="date-inputs">
                        <input type="date" id="start_date" value="${suggestions.start_date}" class="form-control">
                        <input type="date" id="end_date" value="${suggestions.end_date}" class="form-control">
                    </div>
                </div>
            `;

            if (['eventOverview', 'userEngagement', 'eventSequence', 'dailyTrends'].includes(templateKey)) {
                parameterInputs.innerHTML += `
                    <div class="parameter-input-group">
                        <label>이벤트 선택</label>
                        <div class="event-selector">
                            <button id="select-all-events" class="btn btn-secondary">전체 선택</button>
                            <button id="clear-events" class="btn btn-secondary">선택 해제</button>
                            <div class="event-list">
                                ${this.taxonomy?.events?.map(event => `
                                    <div class="event-item">
                                        <input type="checkbox" id="event_${event.event_name}" value="${event.event_name}">
                                        <label for="event_${event.event_name}">${event.event_name} - ${event.description}</label>
                                    </div>
                                `).join('') || '<p>택소노미를 먼저 로드해주세요.</p>'}
                            </div>
                        </div>
                    </div>
                `;
            }

            if (['eventParameters', 'customEventAnalysis'].includes(templateKey)) {
                parameterInputs.innerHTML += `
                    <div class="parameter-input-group">
                        <label for="event_name_select">분석할 이벤트</label>
                        <select id="event_name_select" class="form-control">
                            ${this.taxonomy?.events?.map(event => 
                                `<option value="${event.event_name}">${event.event_name} - ${event.description}</option>`
                            ).join('') || '<option value="">택소노미를 먼저 로드해주세요</option>'}
                        </select>
                    </div>
                `;
            }

            parameterForm.classList.remove('hidden');
            
            this.attachParameterFormListeners();
        } catch (error) {
            this.showMessage('파라미터 폼 로드 실패: ' + error.message, 'error');
        }
    }

    attachParameterFormListeners() {
        document.querySelectorAll('.date-range-selector button').forEach(btn => {
            btn.addEventListener('click', (e) => this.selectDateRange(e));
        });

        const selectAllBtn = document.getElementById('select-all-events');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                document.querySelectorAll('.event-list input[type="checkbox"]').forEach(cb => {
                    cb.checked = true;
                });
            });
        }

        const clearBtn = document.getElementById('clear-events');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                document.querySelectorAll('.event-list input[type="checkbox"]').forEach(cb => {
                    cb.checked = false;
                });
            });
        }
    }

    selectDateRange(event) {
        const range = event.target.dataset.range;
        const today = new Date();
        let startDate, endDate;

        switch(range) {
            case 'last_7_days':
                startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                endDate = today;
                break;
            case 'last_30_days':
                startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                endDate = today;
                break;
            case 'yesterday':
                startDate = endDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
                break;
            default:
                return;
        }

        document.getElementById('start_date').value = startDate.toISOString().split('T')[0];
        document.getElementById('end_date').value = endDate.toISOString().split('T')[0];

        document.querySelectorAll('.date-range-selector button').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
    }

    async generateSQL() {
        const parameters = this.collectParameters();
        
        if (!parameters) {
            this.showMessage('필수 파라미터를 입력해주세요.', 'error');
            return;
        }

        // 4단계에서 데이터셋 선택하므로 여기서는 프로젝트 ID만 설정
        parameters.project_id = this.selectedProject;
        parameters.dataset_id = '{{DATASET_ID}}'; // 플레이스홀더

        this.showLoading(true);
        try {
            const response = await fetch('/api/sql/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateKey: this.selectedTemplate,
                    parameters
                })
            });

            const data = await response.json();
            if (data.success) {
                this.generatedSQL = data.sql;
                this.displayGeneratedSQL(data.sql, data.costEstimate);
                this.showMessage('SQL이 성공적으로 생성되었습니다.', 'success');
                document.getElementById('next-step').disabled = false;
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.showMessage('SQL 생성 실패: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    collectParameters() {
        const parameters = {
            start_date: document.getElementById('start_date')?.value,
            end_date: document.getElementById('end_date')?.value
        };

        const eventCheckboxes = document.querySelectorAll('.event-list input[type="checkbox"]:checked');
        if (eventCheckboxes.length > 0) {
            parameters.event_list = Array.from(eventCheckboxes).map(cb => cb.value);
        }

        const eventNameSelect = document.getElementById('event_name_select');
        if (eventNameSelect) {
            parameters.event_name = eventNameSelect.value;
        }

        return parameters;
    }

    displayGeneratedSQL(sql, costEstimate) {
        const sqlPreview = document.getElementById('sql-preview');
        const generatedSql = document.getElementById('generated-sql');
        const costInfo = document.getElementById('cost-info');
        
        generatedSql.textContent = sql;
        Prism.highlightElement(generatedSql);
        
        if (costEstimate) {
            costInfo.textContent = `예상 비용: $${costEstimate.estimatedCost} USD (약 ${costEstimate.estimatedGB}GB 처리)`;
        }
        
        sqlPreview.classList.remove('hidden');
    }

    async validateQuery() {
        if (!this.generatedSQL || !this.selectedDataset) {
            this.showMessage('먼저 SQL을 생성하고 데이터셋을 선택해주세요.', 'error');
            return;
        }

        // 실제 데이터셋으로 SQL 업데이트
        const finalSQL = this.generatedSQL.replace(/{{DATASET_ID}}/g, this.selectedDataset);

        this.showLoading(true);
        try {
            const response = await fetch('/api/bigquery/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: finalSQL,
                    projectId: this.selectedProject
                })
            });

            const data = await response.json();
            if (data.valid) {
                this.showMessage(`쿼리 검증 성공! 예상 처리량: ${data.estimatedCost.GB}GB`, 'success');
            } else {
                this.showMessage(`쿼리 검증 실패: ${data.error}`, 'error');
            }
        } catch (error) {
            this.showMessage('쿼리 검증 실패: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async executeQuery() {
        if (!this.generatedSQL || !this.selectedDataset) {
            this.showMessage('먼저 SQL을 생성하고 데이터셋을 선택해주세요.', 'error');
            return;
        }

        // 실제 데이터셋으로 SQL 업데이트
        const finalSQL = this.generatedSQL.replace(/{{DATASET_ID}}/g, this.selectedDataset);

        this.showLoading(true);
        try {
            const response = await fetch('/api/bigquery/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: finalSQL,
                    projectId: this.selectedProject
                })
            });

            const data = await response.json();
            if (data.success) {
                this.queryResults = data.results;
                this.displayQueryResults(data.results);
                this.showMessage('쿼리가 성공적으로 실행되었습니다.', 'success');
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.showMessage('쿼리 실행 실패: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayQueryResults(results) {
        const resultsContainer = document.getElementById('query-results');
        const resultsInfo = document.getElementById('results-info');
        const resultsTable = document.getElementById('results-table');
        const thead = resultsTable.querySelector('thead');
        const tbody = resultsTable.querySelector('tbody');
        
        resultsInfo.innerHTML = `
            <p><strong>총 결과:</strong> ${results.totalRows}개 (상위 100개 표시)</p>
            <p><strong>처리된 데이터:</strong> ${(parseInt(results.totalBytesProcessed) / (1024 * 1024 * 1024)).toFixed(2)}GB</p>
            <p><strong>캐시 사용:</strong> ${results.cacheHit ? '예' : '아니오'}</p>
        `;
        
        if (results.rows && results.rows.length > 0) {
            if (results.schema) {
                thead.innerHTML = `<tr>${results.schema.fields.map(field => 
                    `<th>${field.name}</th>`
                ).join('')}</tr>`;
                
                tbody.innerHTML = results.rows.map(row => 
                    `<tr>${row.f.map(cell => 
                        `<td>${cell.v || ''}</td>`
                    ).join('')}</tr>`
                ).join('');
            } else {
                const headers = Object.keys(results.rows[0]);
                thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
                tbody.innerHTML = results.rows.map(row => 
                    `<tr>${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>`
                ).join('');
            }
        }
        
        resultsContainer.classList.remove('hidden');
    }

    async saveAsView() {
        if (!this.generatedSQL || !this.selectedDataset) {
            this.showMessage('먼저 SQL을 생성하고 데이터셋을 선택해주세요.', 'error');
            return;
        }

        const viewName = prompt('뷰 이름을 입력하세요:');
        if (!viewName) return;

        // 실제 데이터셋으로 SQL 업데이트
        const finalSQL = this.generatedSQL.replace(/{{DATASET_ID}}/g, this.selectedDataset);

        this.showLoading(true);
        try {
            const response = await fetch('/api/bigquery/create-view', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: this.selectedProject,
                    datasetId: this.selectedDataset,
                    viewName,
                    query: finalSQL
                })
            });

            const data = await response.json();
            if (data.success) {
                this.showMessage(`뷰 '${viewName}'이 성공적으로 생성되었습니다.`, 'success');
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.showMessage('뷰 생성 실패: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async exportResults(format) {
        if (!this.generatedSQL || !this.selectedDataset) {
            this.showMessage('먼저 쿼리를 실행해주세요.', 'error');
            return;
        }

        // 실제 데이터셋으로 SQL 업데이트
        const finalSQL = this.generatedSQL.replace(/{{DATASET_ID}}/g, this.selectedDataset);

        this.showLoading(true);
        try {
            const response = await fetch('/api/bigquery/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: finalSQL,
                    projectId: this.selectedProject,
                    format
                })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `export_${Date.now()}.${format}`;
                a.click();
                URL.revokeObjectURL(url);
                this.showMessage('내보내기 완료', 'success');
            } else {
                throw new Error('내보내기 실패');
            }
        } catch (error) {
            this.showMessage('내보내기 실패: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    nextStep() {
        if (this.currentStep < this.maxSteps) {
            // 4단계로 이동할 때 데이터셋 로드
            if (this.currentStep === 3) {
                this.loadDatasets();
            }
            this.goToStep(this.currentStep + 1);
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.goToStep(this.currentStep - 1);
        }
    }

    goToStep(step) {
        this.currentStep = step;
        
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        document.querySelector(`.step[data-step="${step}"]`).classList.add('active');
        
        document.querySelectorAll('.step-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`step-${step}`).classList.add('active');
        
        document.getElementById('prev-step').disabled = step === 1;
        document.getElementById('next-step').disabled = step === this.maxSteps;
        
        if (step === this.maxSteps) {
            document.getElementById('next-step').style.display = 'none';
        } else {
            document.getElementById('next-step').style.display = 'block';
        }
    }

    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    showMessage(message, type = 'info') {
        const toast = document.getElementById('message-toast');
        toast.textContent = message;
        toast.className = `message-toast ${type}`;
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 5000);
    }
}

// 전역 로그아웃 함수
async function logout() {
    try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (response.ok) {
            window.location.reload();
        }
    } catch (error) {
        console.error('로그아웃 실패:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new BigQuerySQLGenerator();
});