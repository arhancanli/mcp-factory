// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them live and
// stores the responses, compressed, in test/fixtures.
export const BROKEN = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: Web_App
  labels:
    app: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: website
    spec:
      containers:
        - name: web
          image: nginx
          imagePullPolicy: always
          port:
            - containerPort: 80
          resources:
            requests:
              memory: 512mb
              cpu: "2"
            limits:
              cpu: "1"
          env:
            - name: DB_PASSWORD
              value: hunter2
            - name: DEBUG
              value: yes
          securityContext:
            privileged: true
---
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: web
spec:
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            backend:
              serviceName: web
              servicePort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: http
---
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: cleanup
spec:
  schedule: "0 3 * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: c
              image: busybox:1.36
---
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted
spec: {}
`;

export const CUSTOM = `apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: widgets.example.com
spec:
  group: example.com
  names: { kind: Widget, plural: widgets, singular: widget }
  scope: Namespaced
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              required: [size]
              properties:
                size: { type: integer, minimum: 1 }
                color: { type: string, enum: [red, blue] }
---
apiVersion: example.com/v1
kind: Widget
metadata:
  name: w1
spec:
  size: 0
  colour: red
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: site
spec:
  secretName: site-tls
  dnsNames: [example.com]
  issuerRef:
    name: letsencrypt
    kind: ClusterIssuer
  duraton: 2160h
  renewalWindowHours: 24
---
apiVersion: v1
kind: Pod
metadata:
  name: p
spec:
  hostNetwork: true
  securityContext:
    runAsNonRoot: true
  containers:
    - name: app
      image: registry.example.com/app:1.2.3
      resources: { requests: { cpu: 100m, memory: 64Mi } }
      securityContext:
        capabilities: { add: [NET_ADMIN] }
`;

export const CLEAN = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: shop
  labels:
    app.kubernetes.io/name: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app.kubernetes.io/name: api
  template:
    metadata:
      annotations:
      labels:
        app.kubernetes.io/name: api
    spec:
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: api
          image: ghcr.io/example/api:2.4.1
          ports:
            - name: http
              containerPort: 8080
          readinessProbe:
            httpGet:
              path: /healthz
              port: http
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              memory: 512Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: [ALL]
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: shop
spec:
  selector:
    app.kubernetes.io/name: api
  ports:
    - name: http
      port: 80
      targetPort: http
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
  namespace: shop
spec:
  ingressClassName: nginx
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  name: http
`;

export const UPGRADE = `apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: report
spec:
  schedule: "@daily"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: report
              image: registry.example.com/report:3.1.0
              resources:
                requests: { cpu: 100m, memory: 128Mi }
---
apiVersion: policy/v1beta1
kind: PodDisruptionBudget
metadata:
  name: api
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: api
`;

export const SCENARIOS = [
  { label: "check_manifests: a Deployment with eight mistakes, a removed Ingress, CronJob and PodSecurityPolicy", tool: "check_manifests", args: { files: [{ path: "k8s/app.yaml", content: BROKEN }] }, example: true },
  { label: "check_manifests: a clean Deployment, Service and Ingress under the restricted Pod Security level", tool: "check_manifests", args: { files: [{ path: "k8s/api.yaml", content: CLEAN }], pod_security: "restricted" } },
  { label: "check_manifests: a CRD with its resource, a cert-manager Certificate and a pod, restricted", tool: "check_manifests", args: { files: [{ path: "k8s/custom.yaml", content: CUSTOM }], pod_security: "restricted" } },
  { label: "check_manifests: manifests written for 1.24, checked for the upgrade to 1.25", tool: "check_manifests", args: { files: [{ path: "k8s/legacy.yaml", content: UPGRADE }], kubernetes_version: "1.25" } },
  { label: "check_manifests: the same manifests on 1.24, where they are only deprecated", tool: "check_manifests", args: { files: [{ path: "k8s/legacy.yaml", content: UPGRADE }], kubernetes_version: "1.24" } },
  { label: "api_versions: six kinds and apiVersions", tool: "api_versions", args: { kinds: ["Ingress", "extensions/v1beta1 Ingress", "PodSecurityPolicy", "batch/v1beta1/CronJob", "horizontalpodautoscaler", "Deploymnet"] } },
  { label: "field_help: a Deployment's rolling update surge", tool: "field_help", args: { kind: "Deployment", field: "spec.strategy.rollingUpdate.maxSurge" } },
  { label: "field_help: search a Pod's fields for 'termination grace'", tool: "field_help", args: { kind: "Pod", search: "termination grace" } },
  { label: "field_help: a misspelt field", tool: "field_help", args: { kind: "apps/v1/Deployment", field: "spec.template.spec.containers[].resource" }, expectError: true },
];
