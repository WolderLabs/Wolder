using Wolder.Core.Workspace;
using Wolder.CSharp.CodeActions;
using Wolder.CSharp.ProjectActions;

namespace Wolder.CSharp;

[GenerateActionCall<CreateClass>]
[GenerateActionCall<CompileProject>]
[GenerateActionCall<CreateSdkGlobal>]
public partial class CSharpActions
{
}