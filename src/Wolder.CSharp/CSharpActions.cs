using Wolder.Core.Workspace;
using Wolder.CSharp.Actions;

namespace Wolder.CSharp;

[GenerateActionCall<CreateClass>]
[GenerateActionCall<CompileProject>]
[GenerateActionCall<CreateSdkGlobal>]
public partial class CSharpActions
{
}